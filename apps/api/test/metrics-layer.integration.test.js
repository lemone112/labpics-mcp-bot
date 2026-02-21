import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { evaluateCriteriaAndStoreRun } from "../src/domains/analytics/metrics-contract.js";
import { seedWorkforceFixtures } from "./fixtures/workforce-fixtures.js";

const { Pool } = pg;
const integrationEnabled = process.env.METRICS_LAYER_INTEGRATION === "1";

if (!integrationEnabled) {
  test(
    "metrics layer integration tests are disabled",
    { skip: "set METRICS_LAYER_INTEGRATION=1" },
    () => {}
  );
} else {
  function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
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

  async function createNumericMetric(pool, metricKey, name = "Integration metric") {
    const { rows } = await pool.query(
      `
        INSERT INTO metric_definitions(
          metric_key, version, is_current, name, description, unit, value_type, aggregation_type, source, enabled
        )
        VALUES ($1, 1, true, $2, 'integration metric', 'points', 'numeric', 'avg', 'integration-test', true)
        RETURNING id::text AS id
      `,
      [metricKey, name]
    );
    return rows[0]?.id || null;
  }

  describe("extensible metrics layer", { concurrency: 1 }, () => {
    let pool = null;
    let fixture = null;
    let accountA = null;
    let accountB = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
      await setupDb(pool);
      fixture = await seedWorkforceFixtures(pool);

      const { rows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES
            ($1, $2, 'Metrics Account A', 'active', 'workforce_user_a'),
            ($3, $4, 'Metrics Account B', 'active', 'workforce_user_b')
          RETURNING id::text AS id, project_id::text AS project_id
        `,
        [fixture.projectA, fixture.scopeA, fixture.projectB, fixture.scopeB]
      );
      accountA = rows.find((row) => row.project_id === fixture.projectA)?.id || null;
      accountB = rows.find((row) => row.project_id === fixture.projectB)?.id || null;
      assert.ok(accountA);
      assert.ok(accountB);
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("enforces metric versioning with single current version per key", async () => {
      const metricKey = `metrics.versioning.${Date.now()}`;
      const { rows: v1Rows } = await pool.query(
        `
          INSERT INTO metric_definitions(
            metric_key, version, is_current, name, description, unit, value_type, aggregation_type, source, enabled
          )
          VALUES ($1, 1, true, 'v1 metric', 'first version', 'points', 'numeric', 'avg', 'integration-test', true)
          RETURNING id::text AS id
        `,
        [metricKey]
      );
      assert.ok(v1Rows[0]?.id);

      const { rows: v2Rows } = await pool.query(
        `
          INSERT INTO metric_definitions(
            metric_key, version, is_current, name, description, unit, value_type, aggregation_type, source, enabled
          )
          VALUES ($1, 2, true, 'v2 metric', 'second version', 'points', 'numeric', 'avg', 'integration-test', true)
          RETURNING id::text AS id
        `,
        [metricKey]
      );
      assert.ok(v2Rows[0]?.id);

      const { rows: stateRows } = await pool.query(
        `
          SELECT version, is_current
          FROM metric_definitions
          WHERE metric_key = $1
          ORDER BY version
        `,
        [metricKey]
      );

      assert.equal(stateRows.length, 2);
      assert.equal(stateRows[0]?.version, 1);
      assert.equal(stateRows[0]?.is_current, false);
      assert.equal(stateRows[1]?.version, 2);
      assert.equal(stateRows[1]?.is_current, true);
    });

    it("enforces dimension contract and idempotent ingest key", async () => {
      const metricId = await createNumericMetric(pool, `metrics.dimensions.${Date.now()}`, "dimension metric");
      assert.ok(metricId);

      await pool.query(
        `
          INSERT INTO metric_dimensions(metric_id, dimension_key, dimension_type, required, allowed_values)
          VALUES
            ($1, 'channel', 'enum', true, '["chatwoot","telegram"]'::jsonb),
            ($1, 'period_start', 'date', true, NULL)
        `,
        [metricId]
      );

      const observedAt = "2026-02-21T10:00:00Z";
      const { rows: inserted } = await pool.query(
        `
          INSERT INTO metric_observations(
            metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at,
            value_numeric, dimensions, quality_flags, source, source_event_id
          )
          VALUES (
            $1, $2, $3, 'project', $2, $4, 42.50,
            '{"channel":"chatwoot","period_start":"2026-02-01"}'::jsonb,
            '{"quality":"ok"}'::jsonb,
            'integration-test',
            'ingest-1'
          )
          RETURNING id
        `,
        [metricId, fixture.projectA, fixture.scopeA, observedAt]
      );
      assert.equal(inserted.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at,
                value_numeric, dimensions, quality_flags, source, source_event_id
              )
              VALUES (
                $1, $2, $3, 'project', $2, $4, 42.50,
                '{"period_start":"2026-02-01","channel":"chatwoot"}'::jsonb,
                '{"quality":"ok"}'::jsonb,
                'integration-test',
                'ingest-1-dup'
              )
            `,
            [metricId, fixture.projectA, fixture.scopeA, observedAt]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at,
                value_numeric, dimensions
              )
              VALUES (
                $1, $2, $3, 'project', $2, $4, 10,
                '{"channel":"chatwoot","period_start":"2026-02-01","unknown":"x"}'::jsonb
              )
            `,
            [metricId, fixture.projectA, fixture.scopeA, "2026-02-21T11:00:00Z"]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at,
                value_numeric, dimensions
              )
              VALUES (
                $1, $2, $3, 'project', $2, $4, 11,
                '{"channel":"chatwoot"}'::jsonb
              )
            `,
            [metricId, fixture.projectA, fixture.scopeA, "2026-02-21T11:30:00Z"]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at,
                value_numeric, dimensions
              )
              VALUES (
                $1, $2, $3, 'project', $2, $4, 12,
                '{"channel":"email","period_start":"2026-02-01"}'::jsonb
              )
            `,
            [metricId, fixture.projectA, fixture.scopeA, "2026-02-21T12:00:00Z"]
          )
      );
    });

    it("rejects cross-scope observation subjects", async () => {
      const metricId = await createNumericMetric(pool, `metrics.scope.${Date.now()}`, "scope metric");
      assert.ok(metricId);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at, value_numeric, dimensions
              )
              VALUES ($1, $2, $3, 'employee', $4, now(), 5, '{}'::jsonb)
            `,
            [metricId, fixture.projectA, fixture.scopeA, fixture.employeeB]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_observations(
                metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at, value_numeric, dimensions
              )
              VALUES ($1, $2, $3, 'crm_account', $4, now(), 5, '{}'::jsonb)
            `,
            [metricId, fixture.projectA, fixture.scopeA, accountB]
          )
      );

      const { rows: validRows } = await pool.query(
        `
          INSERT INTO metric_observations(
            metric_id, project_id, account_scope_id, subject_type, subject_id, observed_at, value_numeric, dimensions
          )
          VALUES ($1, $2, $3, 'crm_account', $4, now(), 9, '{}'::jsonb)
          RETURNING id
        `,
        [metricId, fixture.projectA, fixture.scopeA, accountA]
      );
      assert.equal(validRows.length, 1);
    });

    it("creates bridge metric definitions and enforces rollup dedupe", async () => {
      const { rows: bridgeRows } = await pool.query(
        `
          SELECT metric_key, version
          FROM metric_definitions
          WHERE metric_key IN (
            'revenue.pipeline_amount',
            'revenue.expected_revenue',
            'revenue.gross_margin'
          )
          ORDER BY metric_key
        `
      );
      assert.equal(bridgeRows.length, 3);

      const { rows: metricRows } = await pool.query(
        `
          SELECT id::text AS id
          FROM metric_definitions
          WHERE metric_key = 'revenue.expected_revenue'
            AND version = 1
          LIMIT 1
        `
      );
      const bridgeMetricId = metricRows[0]?.id;
      assert.ok(bridgeMetricId);

      const { rows: rollupRows } = await pool.query(
        `
          INSERT INTO metric_rollups(
            metric_id, project_id, account_scope_id, subject_type, subject_id,
            bucket_granularity, bucket_start, bucket_end, dimensions, value_numeric, sample_count
          )
          VALUES (
            $1, $2, $3, 'project', $2,
            'day', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z',
            '{"horizon_days":"30"}'::jsonb, 1234.56, 10
          )
          RETURNING id
        `,
        [bridgeMetricId, fixture.projectA, fixture.scopeA]
      );
      assert.equal(rollupRows.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_rollups(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                bucket_granularity, bucket_start, bucket_end, dimensions, value_numeric, sample_count
              )
              VALUES (
                $1, $2, $3, 'project', $2,
                'day', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z',
                '{"horizon_days":"30"}'::jsonb, 1234.56, 10
              )
            `,
            [bridgeMetricId, fixture.projectA, fixture.scopeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO metric_rollups(
                metric_id, project_id, account_scope_id, subject_type, subject_id,
                bucket_granularity, bucket_start, bucket_end, dimensions, value_numeric, sample_count
              )
              VALUES (
                $1, $2, $3, 'project', $2,
                'day', '2026-02-03T00:00:00Z', '2026-02-04T00:00:00Z',
                '{}'::jsonb, 1, 1
              )
            `,
            [bridgeMetricId, fixture.projectA, fixture.scopeB]
          )
      );
    });

    it("resolves criteria thresholds from DB by scope + segment with fallback", async () => {
      const criteriaKey = `criteria.latency.${Date.now()}`;
      const { rows: criteriaRows } = await pool.query(
        `
          INSERT INTO criteria_definitions(
            criteria_key, version, is_current, name, severity, owner_domain, rule_spec, enabled
          )
          VALUES (
            $1,
            1,
            true,
            'Latency SLA',
            'high',
            'analytics',
            '{"type":"metric_threshold","metric_key":"p95_latency_ms","op":"<=","threshold_ref":"target_ms"}'::jsonb,
            true
          )
          RETURNING id::text AS id
        `,
        [criteriaKey]
      );
      const criteriaId = criteriaRows[0]?.id;
      assert.ok(criteriaId);

      await pool.query(
        `
          INSERT INTO criteria_thresholds(
            criteria_id, project_id, account_scope_id, segment_key, threshold_spec, effective_from
          )
          VALUES
            ($1, NULL, NULL, 'default', '{"target_ms":90}'::jsonb, '2026-01-01T00:00:00Z'),
            ($1, $2, $3, 'default', '{"target_ms":80}'::jsonb, '2026-02-01T00:00:00Z'),
            ($1, $2, $3, 'enterprise', '{"target_ms":75}'::jsonb, '2026-02-10T00:00:00Z'),
            ($1, $2, $3, 'enterprise', '{"target_ms":70}'::jsonb, '2026-02-15T00:00:00Z')
        `,
        [criteriaId, fixture.projectA, fixture.scopeA]
      );

      const enterpriseResult = await evaluateCriteriaAndStoreRun(
        pool,
        { projectId: fixture.projectA, accountScopeId: fixture.scopeA },
        null,
        {
          schema_version: 1,
          trigger_source: "integration-test",
          run_key: `criteria-enterprise-${Date.now()}`,
          evaluations: [
            {
              criteria_key: criteriaKey,
              segment_key: "enterprise",
              subject_type: "project",
              subject_id: fixture.projectA,
              metric_values: { p95_latency_ms: 72 },
              thresholds: {},
              evidence_refs: [],
            },
          ],
        }
      );
      assert.equal(enterpriseResult.summary.total, 1);
      assert.equal(enterpriseResult.summary.fail, 1);
      assert.equal(enterpriseResult.evaluations[0]?.status, "fail");
      assert.deepStrictEqual(enterpriseResult.evaluations[0]?.threshold_snapshot, { target_ms: 70 });

      const fallbackResult = await evaluateCriteriaAndStoreRun(
        pool,
        { projectId: fixture.projectA, accountScopeId: fixture.scopeA },
        null,
        {
          schema_version: 1,
          trigger_source: "integration-test",
          run_key: `criteria-fallback-${Date.now()}`,
          evaluations: [
            {
              criteria_key: criteriaKey,
              segment_key: "smb",
              subject_type: "project",
              subject_id: fixture.projectA,
              metric_values: { p95_latency_ms: 79 },
              thresholds: {},
              evidence_refs: [],
            },
          ],
        }
      );
      assert.equal(fallbackResult.summary.total, 1);
      assert.equal(fallbackResult.summary.pass, 1);
      assert.equal(fallbackResult.evaluations[0]?.status, "pass");
      assert.deepStrictEqual(fallbackResult.evaluations[0]?.threshold_snapshot, { target_ms: 80 });
    });

    it("rejects duplicate criteria + subject tuples in one evaluation run payload", async () => {
      const criteriaKey = `criteria.duplicate.${Date.now()}`;
      await pool.query(
        `
          INSERT INTO criteria_definitions(
            criteria_key, version, is_current, name, severity, owner_domain, rule_spec, enabled
          )
          VALUES (
            $1,
            1,
            true,
            'Duplicate tuple criterion',
            'medium',
            'analytics',
            '{"type":"constant","value":true}'::jsonb,
            true
          )
        `,
        [criteriaKey]
      );

      await assert.rejects(
        () =>
          evaluateCriteriaAndStoreRun(
            pool,
            { projectId: fixture.projectA, accountScopeId: fixture.scopeA },
            null,
            {
              schema_version: 1,
              run_key: `criteria-dup-${Date.now()}`,
              evaluations: [
                {
                  criteria_key: criteriaKey,
                  subject_type: "project",
                  subject_id: fixture.projectA,
                  metric_values: {},
                  thresholds: {},
                  evidence_refs: [],
                },
                {
                  criteria_key: criteriaKey,
                  subject_type: "project",
                  subject_id: fixture.projectA,
                  metric_values: {},
                  thresholds: {},
                  evidence_refs: [],
                },
              ],
            }
          ),
        (err) => err?.code === "criteria_evaluation_duplicate_subject"
      );
    });
  });
}
