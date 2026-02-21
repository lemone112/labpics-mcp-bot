import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("perf budgets config includes metrics ingest and extended query classes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const configPath = join(currentDir, "..", "perf", "perf-budgets.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  assert.ok(config?.budgets, "budgets section is required");
  assert.ok(
    Number.isFinite(Number(config.budgets.metric_observations_write_ingest_p95_ms)),
    "metric observations ingest budget is required"
  );

  const expectedQueries = [
    "metrics_observations_scope_recent",
    "generated_reports_scope_status_recent",
  ];
  for (const key of expectedQueries) {
    assert.ok(
      Number.isFinite(Number(config.budgets?.queries?.[key])),
      `budget query key ${key} must be present`
    );
    assert.ok(
      Number.isFinite(Number(config.baselines?.queries?.[key])),
      `baseline query key ${key} must be present`
    );
    assert.ok(config.plan_shapes?.[key], `plan_shapes rule for ${key} must be present`);
  }
});

test("perf budget script tracks metric observations write ingest benchmark", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    join(currentDir, "..", "scripts", "check-perf-budgets.mjs"),
    "utf8"
  );

  assert.ok(
    source.includes("runMetricObservationWriteIngestBenchmark"),
    "perf script must define metric observation write ingest benchmark"
  );
  assert.ok(
    source.includes("metric_observations_write_ingest_p95_ms"),
    "perf script must check budget/regression for metric observation ingest"
  );
});
