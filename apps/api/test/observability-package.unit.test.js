import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("observability package docs exist with required structures", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = join(currentDir, "..", "..", "..");

  const dashboardPath = join(
    workspaceRoot,
    "docs",
    "operations",
    "observability",
    "workforce-metrics-dashboard.json"
  );
  const alertsPath = join(
    workspaceRoot,
    "docs",
    "operations",
    "observability",
    "workforce-metrics-alerts.json"
  );
  const sloPath = join(
    workspaceRoot,
    "docs",
    "operations",
    "observability",
    "workforce-metrics-slos.md"
  );

  const dashboard = JSON.parse(readFileSync(dashboardPath, "utf8"));
  const alerts = JSON.parse(readFileSync(alertsPath, "utf8"));
  const slos = readFileSync(sloPath, "utf8");

  assert.ok(Array.isArray(dashboard?.dashboard?.panels), "dashboard panels must be an array");
  assert.ok(Array.isArray(alerts?.alerts), "alerts must be an array");
  assert.ok(alerts.alerts.length >= 5, "expected at least 5 alert rules");
  assert.ok(slos.includes("SLO-1"), "SLO document should contain SLO sections");
});

test("health metrics endpoint exports observability counters", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const healthRouteSource = readFileSync(
    join(currentDir, "..", "src", "routes", "health.ts"),
    "utf8"
  );

  const expectedMetricNames = [
    "app_metrics_ingest_batches_success_total",
    "app_metrics_ingest_batches_failed_total",
    "app_criteria_runs_total",
    "app_retention_cleanup_lag_days",
    "app_redis_pubsub_publish_total",
    "app_scope_violation_total",
  ];

  for (const metricName of expectedMetricNames) {
    assert.ok(
      healthRouteSource.includes(metricName),
      `Expected health metrics output to include ${metricName}`
    );
  }
});
