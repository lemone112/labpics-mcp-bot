import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { createCacheLayer } from "../src/infra/cache.js";
import { createRedisClient } from "../src/infra/redis.js";
import { createRedisPubSub } from "../src/infra/redis-pubsub.js";
import { seedWorkforceFixtures } from "./fixtures/workforce-fixtures.js";

const { Pool } = pg;
const integrationEnabled = process.env.INVARIANTS_DB_REDIS_INTEGRATION === "1";

if (!integrationEnabled) {
  test(
    "db+redis invariants integration tests are disabled",
    { skip: "set INVARIANTS_DB_REDIS_INTEGRATION=1" },
    () => {}
  );
} else {
  const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForPostgres(pool, attempts = 30) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        await pool.query("SELECT 1");
        return;
      } catch {
        await sleep(500);
      }
    }
    throw new Error("Postgres did not become ready in time");
  }

  async function waitForRedis(url, attempts = 30) {
    for (let i = 0; i < attempts; i += 1) {
      const client = createRedisClient({ url, logger: silentLogger, name: `redis-it-wait-${i}` });
      if (!client) throw new Error("Redis client was not created");
      try {
        await client.ping();
        await client.quit();
        return;
      } catch {
        client.disconnect();
        await sleep(300);
      }
    }
    throw new Error("Redis did not become ready in time");
  }

  async function resetSchema(pool) {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  }

  describe("DB+Redis integration invariants", { concurrency: 1 }, () => {
    let pool = null;
    let fixture = null;
    let accountA = null;
    let accountB = null;
    let opportunityA = null;
    let employeeA2 = null;
    let metricInvariantId = null;
    let criteriaInvariantId = null;
    let criteriaRunInvariantId = null;
    let cache = null;
    let pubsub = null;

    before(async () => {
      const databaseUrl = requiredEnv("DATABASE_URL");
      const redisUrl = requiredEnv("REDIS_URL");
      process.env.REDIS_URL = redisUrl;

      pool = new Pool({ connectionString: databaseUrl });
      await waitForPostgres(pool);
      await waitForRedis(redisUrl);
      await resetSchema(pool);

      const currentFile = fileURLToPath(import.meta.url);
      const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");
      await applyMigrations(pool, migrationsDir, silentLogger);

      fixture = await seedWorkforceFixtures(pool);

      const { rows: accountRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES
            ($1, $2, 'Invariant Client A', 'active', 'workforce_user_a'),
            ($3, $4, 'Invariant Client B', 'active', 'workforce_user_b')
          RETURNING id::text AS id, project_id::text AS project_id
        `,
        [fixture.projectA, fixture.scopeA, fixture.projectB, fixture.scopeB]
      );
      accountA = accountRows.find((r) => r.project_id === fixture.projectA)?.id || null;
      accountB = accountRows.find((r) => r.project_id === fixture.projectB)?.id || null;
      assert.ok(accountA);
      assert.ok(accountB);

      const { rows: oppRows } = await pool.query(
        `
          INSERT INTO crm_opportunities(
            project_id, account_scope_id, account_id, title, stage, amount_estimate, probability, next_step, owner_username
          )
          VALUES ($1, $2, $3, 'Invariant Opp A', 'qualified', 2000, 0.5, 'validate execution plan', 'workforce_user_a')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA]
      );
      opportunityA = oppRows[0]?.id || null;
      assert.ok(opportunityA);

      const { rows: userRows } = await pool.query(
        `
          INSERT INTO app_users(username, password_hash, role, email)
          VALUES ('workforce_user_a3', 'hash', 'pm', 'workforce_user_a3@example.local')
          RETURNING id::text AS id
        `
      );
      const userA3 = userRows[0]?.id;
      assert.ok(userA3);

      const { rows: employeeRows } = await pool.query(
        `
          INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
          VALUES ($1, $2, 'Employee A3', 'active', 'UTC')
          RETURNING id::text AS id
        `,
        [fixture.scopeA, userA3]
      );
      employeeA2 = employeeRows[0]?.id || null;
      assert.ok(employeeA2);

      const { rows: metricRows } = await pool.query(
        `
          INSERT INTO metric_definitions(
            metric_key,
            version,
            is_current,
            name,
            description,
            unit,
            value_type,
            aggregation_type,
            source,
            enabled,
            metadata
          )
          VALUES (
            'invariants.response_time',
            1,
            true,
            'Invariant response time',
            'Integration metric invariant checks',
            'ms',
            'numeric',
            'avg',
            'integration-test',
            true,
            '{}'::jsonb
          )
          RETURNING id::text AS id
        `
      );
      metricInvariantId = metricRows[0]?.id || null;
      assert.ok(metricInvariantId);

      await pool.query(
        `
          INSERT INTO metric_dimensions(metric_id, dimension_key, dimension_type, required, allowed_values, metadata)
          VALUES (
            $1,
            'channel',
            'enum',
            true,
            '["email","chat"]'::jsonb,
            '{}'::jsonb
          )
        `,
        [metricInvariantId]
      );

      const { rows: criteriaRows } = await pool.query(
        `
          INSERT INTO criteria_definitions(
            criteria_key,
            version,
            is_current,
            name,
            severity,
            owner_domain,
            rule_spec,
            enabled,
            metadata
          )
          VALUES (
            'invariants.metric.threshold',
            1,
            true,
            'Invariant metric threshold',
            'medium',
            'analytics',
            '{"op":"metric_threshold","metric_key":"invariants.response_time","comparison":"lte","value":200}',
            true,
            '{}'::jsonb
          )
          RETURNING id::text AS id
        `
      );
      criteriaInvariantId = criteriaRows[0]?.id || null;
      assert.ok(criteriaInvariantId);

      const { rows: runRows } = await pool.query(
        `
          INSERT INTO criteria_evaluation_runs(
            project_id,
            account_scope_id,
            run_key,
            status,
            trigger_source,
            criteria_version_snapshot
          )
          VALUES (
            $1,
            $2,
            $3,
            'running',
            'integration-test',
            '{}'::jsonb
          )
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, `invariants-run-${Date.now()}`]
      );
      criteriaRunInvariantId = runRows[0]?.id || null;
      assert.ok(criteriaRunInvariantId);

      cache = createCacheLayer({ logger: silentLogger });
      pubsub = createRedisPubSub({ url: redisUrl, logger: silentLogger });
      assert.equal(cache.enabled, true);
      assert.equal(pubsub.enabled, true);
    });

    after(async () => {
      if (pubsub) await pubsub.close();
      if (cache) await cache.close();
      if (pool) await pool.end();
    });

    it("rejects cross-scope writes and invalid foreign references", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'owner', 100, 1, 'active')
            `,
            [fixture.projectB, fixture.scopeB, accountA, fixture.employeeB]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'owner', 100, 1, 'active')
            `,
            [fixture.projectA, fixture.scopeA, randomUUID(), fixture.employeeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_dependencies(
                project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
              )
              VALUES ($1, $2, $3, $4, 'requires')
            `,
            [fixture.projectA, fixture.scopeA, randomUUID(), randomUUID()]
          )
      );
    });

    it("rejects active over-allocation and dependency cycles", async () => {
      const { rows: activeRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES
            ($1, $2, 'crm_account', $3, $4, 'owner', 70, 1, 'active'),
            ($1, $2, 'crm_account', $3, $5, 'delivery_lead', 30, 2, 'active')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA, fixture.employeeA, employeeA2]
      );
      assert.equal(activeRows.length, 2);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'observer', 1, 3, 'active')
            `,
            [fixture.projectA, fixture.scopeA, accountA, fixture.employeeA]
          )
      );

      const { rows: cycleLinks } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES
            ($1, $2, 'crm_opportunity', $3, $4, 'owner', 0, 1, 'planned'),
            ($1, $2, 'crm_opportunity', $3, $5, 'reviewer', 0, 2, 'planned'),
            ($1, $2, 'crm_opportunity', $3, $4, 'observer', 0, 3, 'planned')
          RETURNING id::text AS id, link_type
        `,
        [fixture.projectA, fixture.scopeA, opportunityA, fixture.employeeA, employeeA2]
      );
      const ownerLink = cycleLinks.find((r) => r.link_type === "owner")?.id;
      const reviewerLink = cycleLinks.find((r) => r.link_type === "reviewer")?.id;
      const observerLink = cycleLinks.find((r) => r.link_type === "observer")?.id;
      assert.ok(ownerLink);
      assert.ok(reviewerLink);
      assert.ok(observerLink);

      await pool.query(
        `
          INSERT INTO client_executor_dependencies(project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind)
          VALUES ($1, $2, $3, $4, 'requires'), ($1, $2, $4, $5, 'requires')
        `,
        [fixture.projectA, fixture.scopeA, ownerLink, reviewerLink, observerLink]
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_dependencies(project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind)
              VALUES ($1, $2, $3, $4, 'requires')
            `,
            [fixture.projectA, fixture.scopeA, observerLink, ownerLink]
          )
      );
    });

    it("rejects metric/criteria scope mismatches and metric contract violations", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
              )
              VALUES (
                $1, $2, $3, 'project', $4,
                now(), 120, NULL, '{"channel":"email"}'::jsonb, '{}'::jsonb, 'integration-test', 'missing-fk', false
              )
            `,
            [randomUUID(), fixture.projectA, fixture.scopeA, fixture.projectA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
              )
              VALUES (
                $1, $2, $3, 'employee', $4,
                now(), 140, NULL, '{"channel":"email"}'::jsonb, '{}'::jsonb, 'integration-test', 'cross-scope-employee', false
              )
            `,
            [metricInvariantId, fixture.projectA, fixture.scopeA, fixture.employeeB]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
              )
              VALUES (
                $1, $2, $3, 'employee', $4,
                now(), 160, NULL, '{}'::jsonb, '{}'::jsonb, 'integration-test', 'missing-dim', false
              )
            `,
            [metricInvariantId, fixture.projectA, fixture.scopeA, fixture.employeeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
              )
              VALUES (
                $1, $2, $3, 'employee', $4,
                now(), 160, NULL, '{"channel":"voice"}'::jsonb, '{}'::jsonb, 'integration-test', 'bad-dim-value', false
              )
            `,
            [metricInvariantId, fixture.projectA, fixture.scopeA, fixture.employeeA]
          )
      );

      const inserted = await pool.query(
        `
          INSERT INTO metric_observations(
            metric_id, project_id, account_scope_id, subject_type, subject_id,
            observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
          )
          VALUES (
            $1, $2, $3, 'employee', $4,
            now(), 130, NULL, '{"channel":"chat"}'::jsonb, '{}'::jsonb, 'integration-test', 'valid-metric', false
          )
          RETURNING id
        `,
        [metricInvariantId, fixture.projectA, fixture.scopeA, fixture.employeeA]
      );
      assert.equal(inserted.rowCount, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO criteria_evaluations(
                run_id, criteria_id, project_id, account_scope_id, subject_type, subject_id, status,
                score, reason, evidence_refs, metric_snapshot, threshold_snapshot, error_payload, evaluated_at
              )
              VALUES (
                $1, $2, $3, $4, 'employee', $5, 'pass',
                90, 'cross scope check', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now()
              )
            `,
            [
              criteriaRunInvariantId,
              criteriaInvariantId,
              fixture.projectB,
              fixture.scopeB,
              fixture.employeeA,
            ]
          )
      );
    });

    it("propagates Redis-driven scoped cache invalidation after graph writes", async () => {
      const prefix = `invariants:${fixture.projectA}:`;
      const keyA = `${prefix}links`;
      const keyB = `${prefix}deps`;
      const untouched = `invariants:${fixture.projectB}:keep`;
      await cache.set(keyA, { value: "a" }, 60);
      await cache.set(keyB, { value: "b" }, 60);
      await cache.set(untouched, { value: "keep" }, 60);

      assert.deepStrictEqual(await cache.get(keyA), { value: "a" });
      assert.deepStrictEqual(await cache.get(untouched), { value: "keep" });

      let unsubscribe = null;
      let timer = null;
      let resolveDeleted;
      let rejectDeleted;
      const deletedPromise = new Promise((resolve, reject) => {
        resolveDeleted = resolve;
        rejectDeleted = reject;
      });
      timer = setTimeout(
        () => rejectDeleted(new Error("timed out waiting for redis invalidation")),
        5000
      );
      let settled = false;
      unsubscribe = await pubsub.subscribe("client_executor_changed", (payload) => {
        if (!payload || payload.project_id !== fixture.projectA) return;
        if (settled) return;
        settled = true;
        void cache
          .invalidateByPrefix(prefix)
          .then((deleted) => {
            clearTimeout(timer);
            resolveDeleted(deleted);
          })
          .catch((err) => {
            clearTimeout(timer);
            rejectDeleted(err);
          });
      });

      try {
        await pool.query(
          `
            INSERT INTO client_executor_links(
              project_id, account_scope_id, client_type, client_id,
              employee_id, link_type, allocation_pct, priority, status
            )
            VALUES ($1, $2, 'crm_account', $3, $4, 'backup', 0, 4, 'planned')
          `,
          [fixture.projectA, fixture.scopeA, accountA, employeeA2]
        );

        await sleep(100);
        await pubsub.publish(
          "client_executor_changed",
          JSON.stringify({
            project_id: fixture.projectA,
            account_scope_id: fixture.scopeA,
            source: "integration-test",
            at: new Date().toISOString(),
          })
        );

        const deleted = await deletedPromise;
        assert.ok(deleted >= 2, "expected project-scoped keys to be invalidated");
        assert.equal(await cache.get(keyA), null);
        assert.equal(await cache.get(keyB), null);
        assert.deepStrictEqual(await cache.get(untouched), { value: "keep" });
      } finally {
        if (timer) clearTimeout(timer);
        if (typeof unsubscribe === "function") unsubscribe();
      }
    });
  });
}
