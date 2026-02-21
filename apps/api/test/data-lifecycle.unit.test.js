import test from "node:test";
import assert from "node:assert/strict";

import {
  getAnalyticsRetentionMetrics,
  resolveRetentionConfig,
  runAnalyticsRetentionCleanup,
} from "../src/domains/analytics/data-lifecycle.ts";

function withEnv(patch, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function createMockPool(responses) {
  const calls = [];
  let idx = 0;
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params: params || [] });
      const next = responses[idx++];
      if (typeof next === "function") return next(sql, params, idx - 1);
      return next || { rowCount: 0, rows: [] };
    },
  };
}

test("resolveRetentionConfig uses bounds and defaults", () => {
  const config = resolveRetentionConfig({
    SEARCH_ANALYTICS_RETENTION_DAYS: "5",
    LIGHTRAG_QUERY_RUNS_RETENTION_DAYS: "abc",
    GENERATED_REPORTS_COMPLETED_RETENTION_DAYS: "9999",
    GENERATED_REPORTS_FAILED_RETENTION_DAYS: "30",
    ANALYTICS_RETENTION_BATCH_SIZE: "15",
  });

  assert.equal(config.searchAnalyticsDays, 7); // clamped to min
  assert.equal(config.lightragQueryRunsDays, 180); // fallback default
  assert.equal(config.generatedReportsCompletedDays, 3650); // clamped to max
  assert.equal(config.generatedReportsFailedDays, 30);
  assert.equal(config.batchSize, 100); // clamped to min
});

test("runAnalyticsRetentionCleanup aggregates deleted rows and lag metrics", async () => {
  await withEnv(
    {
      SEARCH_ANALYTICS_RETENTION_DAYS: "365",
      LIGHTRAG_QUERY_RUNS_RETENTION_DAYS: "180",
      GENERATED_REPORTS_COMPLETED_RETENTION_DAYS: "180",
      GENERATED_REPORTS_FAILED_RETENTION_DAYS: "45",
      ANALYTICS_RETENTION_BATCH_SIZE: "100",
    },
    async () => {
      const pool = createMockPool([
        { rowCount: 15, rows: [] }, // search_analytics delete
        { rowCount: 5, rows: [] }, // lightrag delete
        { rowCount: 8, rows: [] }, // generated_reports completed delete
        { rowCount: 3, rows: [] }, // generated_reports failed delete
        { rowCount: 1, rows: [{ lag_days: "2.50" }] }, // search lag
        { rowCount: 1, rows: [{ lag_days: "0" }] }, // lightrag lag
        { rowCount: 1, rows: [{ lag_days: "1.25" }] }, // generated completed lag
        { rowCount: 1, rows: [{ lag_days: "0.5" }] }, // generated failed lag
      ]);
      const logs = { info: [], warn: [] };
      const logger = {
        info: (...args) => logs.info.push(args),
        warn: (...args) => logs.warn.push(args),
      };

      const result = await runAnalyticsRetentionCleanup(
        pool,
        {
          projectId: "00000000-0000-4000-8000-000000000001",
          accountScopeId: "00000000-0000-4000-8000-000000000002",
        },
        logger
      );

      assert.equal(pool.calls.length, 8, "expected 4 delete queries + 4 lag queries");
      assert.equal(result.deleted_rows.total, 31);
      assert.deepEqual(result.deleted_rows, {
        search_analytics: 15,
        lightrag_query_runs: 5,
        generated_reports_completed: 8,
        generated_reports_failed: 3,
        total: 31,
      });
      assert.deepEqual(result.overdue_lag_days, {
        search_analytics: 2.5,
        lightrag_query_runs: 0,
        generated_reports_completed: 1.25,
        generated_reports_failed: 0.5,
      });
      assert.equal(logs.warn.length, 0, "no batch saturation expected");
      assert.equal(logs.info.length, 1, "expected final summary log");

      const runtime = getAnalyticsRetentionMetrics();
      assert.ok(runtime.runs_total >= 1);
      assert.ok(runtime.deleted_rows_total >= 31);
      assert.equal(runtime.last_deleted_rows, 31);
      assert.equal(runtime.overdue_lag_days.search_analytics, 2.5);
    }
  );
});

test("runAnalyticsRetentionCleanup logs saturation warning when batch size is reached", async () => {
  await withEnv(
    {
      ANALYTICS_RETENTION_BATCH_SIZE: "100",
    },
    async () => {
      const before = getAnalyticsRetentionMetrics();
      const pool = createMockPool([
        { rowCount: 100, rows: [] },
        { rowCount: 100, rows: [] },
        { rowCount: 100, rows: [] },
        { rowCount: 100, rows: [] },
        { rowCount: 1, rows: [{ lag_days: "0" }] },
        { rowCount: 1, rows: [{ lag_days: "0" }] },
        { rowCount: 1, rows: [{ lag_days: "0" }] },
        { rowCount: 1, rows: [{ lag_days: "0" }] },
      ]);
      const logs = { info: [], warn: [] };
      const logger = {
        info: (...args) => logs.info.push(args),
        warn: (...args) => logs.warn.push(args),
      };

      await runAnalyticsRetentionCleanup(
        pool,
        {
          projectId: "00000000-0000-4000-8000-000000000001",
          accountScopeId: "00000000-0000-4000-8000-000000000002",
        },
        logger
      );

      assert.equal(logs.warn.length, 4, "expected warning per saturated table window");

      const after = getAnalyticsRetentionMetrics();
      assert.ok(after.runs_total >= before.runs_total + 1);
      assert.ok(after.saturation_warnings_total >= before.saturation_warnings_total + 4);
    }
  );
});
