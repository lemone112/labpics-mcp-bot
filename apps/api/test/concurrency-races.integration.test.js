import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { findCachedResponse, storeCachedResponse } from "../src/infra/idempotency.js";
import { seedWorkforceFixtures } from "./fixtures/workforce-fixtures.js";

const { Pool } = pg;
const integrationEnabled = process.env.CONCURRENCY_RACES_INTEGRATION === "1";

if (!integrationEnabled) {
  test(
    "concurrency race integration tests are disabled",
    { skip: "set CONCURRENCY_RACES_INTEGRATION=1" },
    () => {}
  );
} else {
  function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function envInt(name, fallback, min, max) {
    const raw = Number.parseInt(process.env[name] || "", 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, raw));
  }

  const raceRepeats = envInt("CONCURRENCY_RACE_REPEATS", 6, 3, 24);

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

  async function resetSchema(pool) {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  }

  async function setupDb(pool) {
    const currentFile = fileURLToPath(import.meta.url);
    const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");
    await resetSchema(pool);
    await applyMigrations(pool, migrationsDir, console);
  }

  describe("race-condition integration suite", { concurrency: 1 }, () => {
    let pool = null;
    let fixture = null;
    let accountA = null;
    let opportunityA = null;
    let employeeA2 = null;
    let ownerLink = null;
    let reviewerLink = null;
    let conditionA = null;
    let conditionB = null;
    let metricConcurrencyId = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL"), max: 20 });
      await waitForPostgres(pool);
      await setupDb(pool);
      fixture = await seedWorkforceFixtures(pool);

      const { rows: accountRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES ($1, $2, 'Concurrency Account A', 'active', 'workforce_user_a')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA]
      );
      accountA = accountRows[0]?.id || null;
      assert.ok(accountA);

      const { rows: oppRows } = await pool.query(
        `
          INSERT INTO crm_opportunities(
            project_id, account_scope_id, account_id, title, stage, amount_estimate, probability, next_step, owner_username
          )
          VALUES ($1, $2, $3, 'Concurrency Opp A', 'qualified', 2500, 0.55, 'prepare roadmap', 'workforce_user_a')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA]
      );
      opportunityA = oppRows[0]?.id || null;
      assert.ok(opportunityA);

      const { rows: userRows } = await pool.query(
        `
          INSERT INTO app_users(username, password_hash, role, email)
          VALUES ('workforce_user_a_concurrency', 'hash', 'pm', 'workforce_user_a_concurrency@example.local')
          RETURNING id::text AS id
        `
      );
      const userA2 = userRows[0]?.id;
      assert.ok(userA2);

      const { rows: employeeRows } = await pool.query(
        `
          INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
          VALUES ($1, $2, 'Employee A Concurrency', 'active', 'UTC')
          RETURNING id::text AS id
        `,
        [fixture.scopeA, userA2]
      );
      employeeA2 = employeeRows[0]?.id || null;
      assert.ok(employeeA2);

      const { rows: conditionRows } = await pool.query(
        `
          INSERT INTO employee_conditions(
            employee_id, project_id, account_scope_id, condition_type, payload, effective_from, effective_to
          )
          VALUES
            ($1, $2, $3, 'workload', '{"hours": 8}'::jsonb, '2026-04-01T00:00:00Z', '2026-04-10T00:00:00Z'),
            ($1, $2, $3, 'workload', '{"hours": 6}'::jsonb, '2026-05-01T00:00:00Z', '2026-05-10T00:00:00Z')
          RETURNING id::text AS id, effective_from
        `,
        [fixture.employeeA, fixture.projectA, fixture.scopeA]
      );
      assert.equal(conditionRows.length, 2);
      conditionA = conditionRows[0]?.id || null;
      conditionB = conditionRows[1]?.id || null;
      assert.ok(conditionA);
      assert.ok(conditionB);

      const { rows: linkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES
            ($1, $2, 'crm_opportunity', $3, $4, 'owner', 0, 1, 'planned'),
            ($1, $2, 'crm_opportunity', $3, $5, 'reviewer', 0, 2, 'planned')
          RETURNING id::text AS id, link_type
        `,
        [fixture.projectA, fixture.scopeA, opportunityA, fixture.employeeA, employeeA2]
      );
      ownerLink = linkRows.find((row) => row.link_type === "owner")?.id || null;
      reviewerLink = linkRows.find((row) => row.link_type === "reviewer")?.id || null;
      assert.ok(ownerLink);
      assert.ok(reviewerLink);

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
            'concurrency.parallel.ingest',
            1,
            true,
            'Concurrency metric ingest',
            'Synthetic metric for race-condition tests',
            'count',
            'numeric',
            'sum',
            'integration-test',
            true,
            '{}'::jsonb
          )
          RETURNING id::text AS id
        `
      );
      metricConcurrencyId = metricRows[0]?.id || null;
      assert.ok(metricConcurrencyId);
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("keeps project assignments deterministic under parallel assign/unassign", async () => {
      for (let attempt = 0; attempt < raceRepeats; attempt += 1) {
        await pool.query("DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2", [
          fixture.userA,
          fixture.projectA,
        ]);

        const insertRuns = await Promise.allSettled(
          Array.from({ length: 12 }, () =>
            pool.query(
              `
                INSERT INTO project_assignments(user_id, project_id, assigned_by)
                VALUES ($1, $2, $3)
                ON CONFLICT (user_id, project_id) DO NOTHING
                RETURNING id::text AS id
              `,
              [fixture.userA, fixture.projectA, fixture.userA]
            )
          )
        );
        assert.equal(
          insertRuns.filter((run) => run.status === "rejected").length,
          0,
          "parallel assignment inserts must not fail"
        );
        const inserted = insertRuns.filter((run) => run.status === "fulfilled" && run.value.rowCount === 1).length;
        assert.equal(inserted, 1, "exactly one assignment insert should win");

        const { rows: countAfterInsert } = await pool.query(
          "SELECT count(*)::int AS count FROM project_assignments WHERE user_id = $1 AND project_id = $2",
          [fixture.userA, fixture.projectA]
        );
        assert.equal(countAfterInsert[0]?.count, 1);

        const deleteRuns = await Promise.allSettled(
          Array.from({ length: 12 }, () =>
            pool.query("DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2 RETURNING id", [
              fixture.userA,
              fixture.projectA,
            ])
          )
        );
        assert.equal(
          deleteRuns.filter((run) => run.status === "rejected").length,
          0,
          "parallel assignment deletes must not fail"
        );
        const deleted = deleteRuns.filter((run) => run.status === "fulfilled" && run.value.rowCount === 1).length;
        assert.equal(deleted, 1, "exactly one assignment delete should remove the row");

        const { rows: countAfterDelete } = await pool.query(
          "SELECT count(*)::int AS count FROM project_assignments WHERE user_id = $1 AND project_id = $2",
          [fixture.userA, fixture.projectA]
        );
        assert.equal(countAfterDelete[0]?.count, 0);
      }
    });

    it("serializes parallel employee condition updates and prevents overlaps", async () => {
      for (let attempt = 0; attempt < raceRepeats; attempt += 1) {
        await pool.query(
          `
            UPDATE employee_conditions
            SET effective_from = '2026-04-01T00:00:00Z', effective_to = '2026-04-10T00:00:00Z'
            WHERE id = $1
          `,
          [conditionA]
        );
        await pool.query(
          `
            UPDATE employee_conditions
            SET effective_from = '2026-05-01T00:00:00Z', effective_to = '2026-05-10T00:00:00Z'
            WHERE id = $1
          `,
          [conditionB]
        );

        const updateRuns = await Promise.allSettled([
          pool.query(
            `
              UPDATE employee_conditions
              SET payload = '{"hours": 9}'::jsonb,
                  effective_from = '2026-03-01T00:00:00Z',
                  effective_to = '2026-03-20T00:00:00Z'
              WHERE id = $1
            `,
            [conditionA]
          ),
          pool.query(
            `
              UPDATE employee_conditions
              SET payload = '{"hours": 7}'::jsonb,
                  effective_from = '2026-03-10T00:00:00Z',
                  effective_to = '2026-03-25T00:00:00Z'
              WHERE id = $1
            `,
            [conditionB]
          ),
        ]);

        const successful = updateRuns.filter((run) => run.status === "fulfilled").length;
        const failed = updateRuns.filter((run) => run.status === "rejected").length;
        assert.equal(successful, 1, "only one conflicting condition update should be committed");
        assert.equal(failed, 1, "one conflicting condition update must be rejected");

        const { rows: overlapRows } = await pool.query(
          `
            SELECT count(*)::int AS overlap_count
            FROM employee_conditions c1
            JOIN employee_conditions c2
              ON c1.id < c2.id
             AND c1.employee_id = c2.employee_id
             AND c1.condition_type = c2.condition_type
             AND (
               (c1.project_id IS NULL AND c2.project_id IS NULL)
               OR c1.project_id = c2.project_id
             )
            WHERE c1.employee_id = $1
              AND tstzrange(
                    c1.effective_from,
                    COALESCE(c1.effective_to, 'infinity'::timestamptz),
                    '[)'
                  ) && tstzrange(
                    c2.effective_from,
                    COALESCE(c2.effective_to, 'infinity'::timestamptz),
                    '[)'
                  )
          `,
          [fixture.employeeA]
        );
        assert.equal(overlapRows[0]?.overlap_count, 0, "no overlapping condition windows are allowed");
      }
    });

    it("prevents reciprocal dependency race from creating graph cycles", async () => {
      const dependencyInsertSql = `
        INSERT INTO client_executor_dependencies(
          project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
        )
        VALUES ($1, $2, $3, $4, 'requires')
      `;

      for (let attempt = 0; attempt < raceRepeats; attempt += 1) {
        await pool.query(
          `
            DELETE FROM client_executor_dependencies
            WHERE parent_link_id IN ($1, $2)
               OR child_link_id IN ($1, $2)
          `,
          [ownerLink, reviewerLink]
        );

        const clientA = await pool.connect();
        const clientB = await pool.connect();
        let insertBError = null;

        try {
          await clientA.query("BEGIN");
          await clientB.query("BEGIN");
          await clientA.query("SET LOCAL lock_timeout = '5s'");
          await clientB.query("SET LOCAL lock_timeout = '5s'");

          await clientA.query(dependencyInsertSql, [fixture.projectA, fixture.scopeA, ownerLink, reviewerLink]);

          const insertBPromise = clientB.query(dependencyInsertSql, [
            fixture.projectA,
            fixture.scopeA,
            reviewerLink,
            ownerLink,
          ]);

          await sleep(50);
          await clientA.query("COMMIT");

          try {
            await insertBPromise;
            await clientB.query("COMMIT");
          } catch (error) {
            insertBError = error;
            await clientB.query("ROLLBACK");
          }
        } finally {
          try {
            await clientA.query("ROLLBACK");
          } catch {}
          try {
            await clientB.query("ROLLBACK");
          } catch {}
          clientA.release();
          clientB.release();
        }

        assert.ok(insertBError, "reciprocal insert should be rejected to prevent a cycle");

        const { rows: depRows } = await pool.query(
          `
            SELECT count(*)::int AS count
            FROM client_executor_dependencies
            WHERE parent_link_id IN ($1, $2)
              AND child_link_id IN ($1, $2)
          `,
          [ownerLink, reviewerLink]
        );
        assert.equal(depRows[0]?.count, 1, "dependency graph must keep only one directed edge");

        const { rows: cycleRows } = await pool.query(
          `
            SELECT EXISTS(
              SELECT 1
              FROM client_executor_dependencies d1
              JOIN client_executor_dependencies d2
                ON d1.parent_link_id = d2.child_link_id
               AND d1.child_link_id = d2.parent_link_id
              WHERE d1.parent_link_id IN ($1, $2)
                AND d1.child_link_id IN ($1, $2)
            ) AS has_cycle
          `,
          [ownerLink, reviewerLink]
        );
        assert.equal(cycleRows[0]?.has_cycle, false, "graph must not contain reciprocal cycles");
      }
    });

    it("keeps idempotency keys stable under concurrent writes", async () => {
      const idemKey = `concurrency-key-${Date.now()}`;

      const writes = await Promise.allSettled(
        Array.from({ length: 20 }, (_, attempt) =>
          storeCachedResponse(
            pool,
            fixture.projectA,
            idemKey,
            "/crm/accounts",
            201,
            {
              ok: true,
              attempt,
            }
          )
        )
      );
      assert.equal(
        writes.filter((run) => run.status === "rejected").length,
        0,
        "concurrent idempotency writes must not fail"
      );

      await storeCachedResponse(pool, fixture.projectB, idemKey, "/crm/accounts", 201, { ok: true, project: "b" });

      const { rows: idemRows } = await pool.query(
        `
          SELECT project_id::text AS project_id, count(*)::int AS count
          FROM idempotency_keys
          WHERE idempotency_key = $1
          GROUP BY project_id
        `,
        [idemKey]
      );
      assert.equal(idemRows.length, 2, "same idempotency key may exist for different projects");
      const projectACount = idemRows.find((row) => row.project_id === fixture.projectA)?.count || 0;
      const projectBCount = idemRows.find((row) => row.project_id === fixture.projectB)?.count || 0;
      assert.equal(projectACount, 1, "project-scoped idempotency key must remain unique");
      assert.equal(projectBCount, 1, "project-scoped idempotency key must remain unique");

      const cached = await findCachedResponse(pool, fixture.projectA, idemKey);
      assert.ok(cached);
      assert.equal(cached?.status_code, 201);
      assert.equal(typeof cached?.response_body, "object");
    });

    it("deduplicates parallel metric writes by unique ingest key", async () => {
      const observedAt = "2026-07-01T00:00:00.000Z";
      for (let attempt = 0; attempt < raceRepeats; attempt += 1) {
        await pool.query(
          `
            DELETE FROM metric_observations
            WHERE metric_id = $1
              AND project_id = $2
              AND account_scope_id = $3
              AND subject_type = 'project'
              AND subject_id = $2
              AND observed_at = $4::timestamptz
          `,
          [metricConcurrencyId, fixture.projectA, fixture.scopeA, observedAt]
        );

        const writes = await Promise.allSettled(
          Array.from({ length: 16 }, (_, idx) =>
            pool.query(
              `
                INSERT INTO metric_observations(
                  metric_id, project_id, account_scope_id, subject_type, subject_id,
                  observed_at, value_numeric, value_text, dimensions, quality_flags, source, source_event_id, is_backfill
                )
                VALUES (
                  $1, $2, $3, 'project', $2,
                  $4::timestamptz, 42, NULL, '{}'::jsonb, '{}'::jsonb, 'integration-test', $5, false
                )
                ON CONFLICT (
                  metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at, dimension_hash
                ) DO NOTHING
                RETURNING id
              `,
              [metricConcurrencyId, fixture.projectA, fixture.scopeA, observedAt, `parallel-${attempt}-${idx}`]
            )
          )
        );

        assert.equal(
          writes.filter((run) => run.status === "rejected").length,
          0,
          "parallel metric observation writes with ON CONFLICT must not fail"
        );
        const inserted = writes.filter(
          (run) => run.status === "fulfilled" && run.value.rowCount === 1
        ).length;
        assert.equal(inserted, 1, "exactly one metric observation insert should win");

        const { rows: countRows } = await pool.query(
          `
            SELECT count(*)::int AS count
            FROM metric_observations
            WHERE metric_id = $1
              AND project_id = $2
              AND account_scope_id = $3
              AND subject_type = 'project'
              AND subject_id = $2
              AND observed_at = $4::timestamptz
          `,
          [metricConcurrencyId, fixture.projectA, fixture.scopeA, observedAt]
        );
        assert.equal(
          countRows[0]?.count,
          1,
          "metric observation ingest idempotency key must keep a single row"
        );
      }
    });
  });
}
