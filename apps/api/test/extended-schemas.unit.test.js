import test from "node:test";
import assert from "node:assert/strict";

import { parseBody } from "../src/infra/api-contract.js";
import {
  SignalStatusSchema,
  NbaStatusSchema,
  IdentityPreviewSchema,
  IdentitySuggestionApplySchema,
  RecommendationsShownSchema,
  RecommendationStatusSchema,
  RecommendationFeedbackSchema,
  RecommendationActionSchema,
  RecommendationActionRetrySchema,
  ConnectorRetrySchema,
  AnalyticsRefreshSchema,
  OutboundApproveSchema,
  OutboundProcessSchema,
  LoopsSyncSchema,
  UpsellStatusSchema,
  ContinuityApplySchema,
  MetricDefinitionUpsertSchema,
  MetricsIngestSchema,
  MetricsQuerySchema,
  MetricsExportSchema,
  CriteriaEvaluateSchema,
} from "../src/infra/schemas.js";

// ===========================================================================
// Iter 9 — Extended Input Validation
// ===========================================================================

// ---------------------------------------------------------------------------
// 9.1 Signals & Identity
// ---------------------------------------------------------------------------

test("SignalStatusSchema accepts valid enum status", () => {
  const result = parseBody(SignalStatusSchema, { status: "accepted" });
  assert.equal(result.status, "accepted");
});

test("SignalStatusSchema rejects unknown status", () => {
  assert.throws(() => parseBody(SignalStatusSchema, { status: "active" }), (err) => err.code === "validation_error");
});

test("NbaStatusSchema accepts valid status", () => {
  const result = parseBody(NbaStatusSchema, { status: "cancelled" });
  assert.equal(result.status, "cancelled");
});

test("NbaStatusSchema rejects legacy unknown status", () => {
  assert.throws(() => parseBody(NbaStatusSchema, { status: "approved" }), (err) => err.code === "validation_error");
});

test("IdentityPreviewSchema has limit with default 100", () => {
  const result = parseBody(IdentityPreviewSchema, {});
  assert.equal(result.limit, 100);
});

test("IdentityPreviewSchema clamps limit to max 200", () => {
  assert.throws(() => parseBody(IdentityPreviewSchema, { limit: 500 }), (err) => err.code === "validation_error");
});

test("IdentitySuggestionApplySchema defaults to empty array", () => {
  const result = parseBody(IdentitySuggestionApplySchema, {});
  assert.deepEqual(result.suggestion_ids, []);
});

test("IdentitySuggestionApplySchema accepts string array", () => {
  const result = parseBody(IdentitySuggestionApplySchema, { suggestion_ids: ["a", "b"] });
  assert.deepEqual(result.suggestion_ids, ["a", "b"]);
});

// ---------------------------------------------------------------------------
// 9.2 Recommendations
// ---------------------------------------------------------------------------

test("RecommendationsShownSchema defaults to empty ids", () => {
  const result = parseBody(RecommendationsShownSchema, {});
  assert.deepEqual(result.recommendation_ids, []);
  assert.equal(result.all_projects, false);
});

test("RecommendationsShownSchema parses all_projects from string 'true'", () => {
  const result = parseBody(RecommendationsShownSchema, { all_projects: "true", recommendation_ids: ["x"] });
  assert.equal(result.all_projects, true);
  assert.deepEqual(result.recommendation_ids, ["x"]);
});

test("RecommendationStatusSchema requires status", () => {
  assert.throws(() => parseBody(RecommendationStatusSchema, {}), (err) => err.code === "validation_error");
});

test("RecommendationStatusSchema accepts valid status", () => {
  const result = parseBody(RecommendationStatusSchema, { status: " Accepted " });
  assert.equal(result.status, "accepted");
});

test("RecommendationFeedbackSchema has defaults", () => {
  const result = parseBody(RecommendationFeedbackSchema, {});
  assert.equal(result.helpful, "unknown");
  assert.equal(result.all_projects, false);
});

test("RecommendationActionSchema requires action_type", () => {
  assert.throws(() => parseBody(RecommendationActionSchema, {}), (err) => err.code === "validation_error");
});

test("RecommendationActionSchema accepts valid action", () => {
  const result = parseBody(RecommendationActionSchema, { action_type: "send_email", action_payload: { to: "test@test.com" } });
  assert.equal(result.action_type, "send_email");
  assert.deepEqual(result.action_payload, { to: "test@test.com" });
});

test("RecommendationActionRetrySchema defaults all_projects to false", () => {
  const result = parseBody(RecommendationActionRetrySchema, {});
  assert.equal(result.all_projects, false);
});

// ---------------------------------------------------------------------------
// 9.3 Connectors & Jobs
// ---------------------------------------------------------------------------

test("ConnectorRetrySchema has limit default 20", () => {
  const result = parseBody(ConnectorRetrySchema, {});
  assert.equal(result.limit, 20);
});

test("ConnectorRetrySchema clamps limit to max 500", () => {
  assert.throws(() => parseBody(ConnectorRetrySchema, { limit: 1000 }), (err) => err.code === "validation_error");
});

test("AnalyticsRefreshSchema has period_days default 30", () => {
  const result = parseBody(AnalyticsRefreshSchema, {});
  assert.equal(result.period_days, 30);
});

test("AnalyticsRefreshSchema rejects period_days > 120", () => {
  assert.throws(() => parseBody(AnalyticsRefreshSchema, { period_days: 200 }), (err) => err.code === "validation_error");
});

// ---------------------------------------------------------------------------
// 9.4 Outbound, Continuity & Upsell
// ---------------------------------------------------------------------------

test("OutboundApproveSchema defaults evidence_refs to empty", () => {
  const result = parseBody(OutboundApproveSchema, {});
  assert.deepEqual(result.evidence_refs, []);
});

test("OutboundProcessSchema has limit default 20", () => {
  const result = parseBody(OutboundProcessSchema, {});
  assert.equal(result.limit, 20);
});

test("OutboundProcessSchema clamps limit to max 200", () => {
  assert.throws(() => parseBody(OutboundProcessSchema, { limit: 500 }), (err) => err.code === "validation_error");
});

test("LoopsSyncSchema defaults project_ids to empty", () => {
  const result = parseBody(LoopsSyncSchema, {});
  assert.deepEqual(result.project_ids, []);
});

test("LoopsSyncSchema accepts project_ids array", () => {
  const projectIds = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];
  const result = parseBody(LoopsSyncSchema, { project_ids: projectIds });
  assert.deepEqual(result.project_ids, projectIds);
});

test("LoopsSyncSchema rejects non-uuid project ids", () => {
  assert.throws(
    () => parseBody(LoopsSyncSchema, { project_ids: ["not-a-uuid"] }),
    (err) => err.code === "validation_error"
  );
});

test("UpsellStatusSchema accepts valid status", () => {
  const result = parseBody(UpsellStatusSchema, { status: "accepted" });
  assert.equal(result.status, "accepted");
});

test("UpsellStatusSchema rejects unknown status", () => {
  assert.throws(() => parseBody(UpsellStatusSchema, { status: "active" }), (err) => err.code === "validation_error");
});

test("ContinuityApplySchema defaults action_ids to empty", () => {
  const result = parseBody(ContinuityApplySchema, {});
  assert.deepEqual(result.action_ids, []);
});

test("ContinuityApplySchema accepts string array", () => {
  const result = parseBody(ContinuityApplySchema, { action_ids: ["id1", "id2"] });
  assert.deepEqual(result.action_ids, ["id1", "id2"]);
});

// ---------------------------------------------------------------------------
// 9.5 Dead letter functions exist in connector-state
// ---------------------------------------------------------------------------

test("listDeadLetterErrors and retryDeadLetterError are exported", async () => {
  const mod = await import("../src/domains/connectors/connector-state.js");
  assert.equal(typeof mod.listDeadLetterErrors, "function");
  assert.equal(typeof mod.retryDeadLetterError, "function");
});

// ---------------------------------------------------------------------------
// Integration: all new schemas are imported in index.js
// ---------------------------------------------------------------------------

test("index.js imports all new schemas", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(currentDir, "..", "src", "index.js"), "utf8");

  const expectedSchemas = [
    "SignalStatusSchema", "NbaStatusSchema", "IdentityPreviewSchema",
    "IdentitySuggestionApplySchema",
    "ConnectorRetrySchema", "AnalyticsRefreshSchema",
    "OutboundApproveSchema", "OutboundProcessSchema",
    "LoopsSyncSchema", "UpsellStatusSchema", "ContinuityApplySchema",
  ];
  for (const name of expectedSchemas) {
    assert.ok(source.includes(name), `Expected ${name} to be imported in index.js`);
  }
});

test("dead letter endpoints exist in route files", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const routesDir = join(currentDir, "..", "src", "routes");
  const connectorRoutePathTs = join(routesDir, "connectors.ts");
  const connectorRoutePathJs = join(routesDir, "connectors.js");
  const connectorRoutePath = existsSync(connectorRoutePathTs) ? connectorRoutePathTs : connectorRoutePathJs;
  const connectorRouteSource = readFileSync(connectorRoutePath, "utf8");

  assert.ok(connectorRouteSource.includes("/connectors/errors/dead-letter"), "Expected dead-letter GET endpoint");
  assert.ok(connectorRouteSource.includes("/connectors/errors/dead-letter/:id/retry"), "Expected dead-letter retry POST endpoint");
});

test("migration 0034 aligns NBA status contract to accepted/dismissed", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migration = readFileSync(
    join(currentDir, "..", "db", "migrations", "0034_nba_status_contract.sql"),
    "utf8"
  );

  assert.ok(migration.includes("status = 'accepted'"), "Expected migration to rewrite legacy approved status");
  assert.ok(
    migration.includes("('proposed', 'accepted', 'dismissed', 'done', 'cancelled')"),
    "Expected new NBA status check set"
  );
});

// ---------------------------------------------------------------------------
// 10.1 Metrics & Criteria API contracts
// ---------------------------------------------------------------------------

test("MetricDefinitionUpsertSchema defaults schema_version and dimensions", () => {
  const payload = parseBody(MetricDefinitionUpsertSchema, {
    metric_key: "sales.velocity",
    name: "Sales Velocity",
    value_type: "numeric",
    aggregation_type: "avg",
  });

  assert.equal(payload.schema_version, 1);
  assert.equal(payload.promote_new_version, false);
  assert.deepEqual(payload.dimensions, []);
});

test("MetricDefinitionUpsertSchema rejects unsupported value_type", () => {
  assert.throws(
    () =>
      parseBody(MetricDefinitionUpsertSchema, {
        metric_key: "sales.velocity",
        name: "Sales Velocity",
        value_type: "money",
        aggregation_type: "avg",
      }),
    (err) => err.code === "validation_error"
  );
});

test("MetricsIngestSchema enforces idempotency key and observation limits", () => {
  const payload = parseBody(MetricsIngestSchema, {
    idempotency_key: "batch-1",
    observations: [
      {
        metric_key: "sales.velocity",
        subject_type: "project",
        subject_id: "00000000-0000-4000-8000-000000000001",
        observed_at: "2026-02-21T12:00:00.000Z",
        value_numeric: 12.5,
      },
    ],
  });

  assert.equal(payload.schema_version, 1);
  assert.equal(payload.observations.length, 1);
  assert.equal(payload.observations[0].is_backfill, false);
});

test("MetricsIngestSchema rejects empty observation batch", () => {
  assert.throws(
    () =>
      parseBody(MetricsIngestSchema, {
        idempotency_key: "batch-empty",
        observations: [],
      }),
    (err) => err.code === "validation_error"
  );
});

test("MetricsQuerySchema and MetricsExportSchema have stable defaults", () => {
  const queryPayload = parseBody(MetricsQuerySchema, {});
  assert.equal(queryPayload.schema_version, 1);
  assert.equal(queryPayload.limit, 100);
  assert.equal(queryPayload.offset, 0);
  assert.equal(queryPayload.sort_by, "observed_at");
  assert.equal(queryPayload.sort_order, "desc");

  const exportPayload = parseBody(MetricsExportSchema, {});
  assert.equal(exportPayload.schema_version, 1);
  assert.equal(exportPayload.limit, 1000);
  assert.equal(exportPayload.format, "json");
});

test("MetricsQuerySchema rejects invalid ISO date filters", () => {
  assert.throws(
    () => parseBody(MetricsQuerySchema, { date_from: "yesterday", date_to: "tomorrow" }),
    (err) => err.code === "validation_error"
  );
});

test("CriteriaEvaluateSchema validates evaluation batch payload", () => {
  const payload = parseBody(CriteriaEvaluateSchema, {
    idempotency_key: "criteria-run-1",
    evaluations: [
      {
        criteria_key: "quality.delivery",
        subject_type: "project",
        subject_id: "00000000-0000-4000-8000-000000000001",
        metric_values: { avg_response_minutes: 15 },
      },
    ],
  });

  assert.equal(payload.schema_version, 1);
  assert.equal(payload.idempotency_key, "criteria-run-1");
  assert.equal(payload.trigger_source, "api");
  assert.equal(payload.evaluations.length, 1);
  assert.equal(payload.evaluations[0].segment_key, "default");
  assert.deepEqual(payload.evaluations[0].thresholds, {});
});

test("CriteriaEvaluateSchema rejects invalid subject_id", () => {
  assert.throws(
    () =>
      parseBody(CriteriaEvaluateSchema, {
        evaluations: [
          {
            criteria_key: "quality.delivery",
            subject_type: "project",
            subject_id: "not-a-uuid",
            metric_values: {},
          },
        ],
      }),
    (err) => err.code === "validation_error"
  );
});

test("CriteriaEvaluateSchema accepts explicit segment_key and rejects blank values", () => {
  const payload = parseBody(CriteriaEvaluateSchema, {
    evaluations: [
      {
        criteria_key: "quality.delivery",
        segment_key: "enterprise",
        subject_type: "project",
        subject_id: "00000000-0000-4000-8000-000000000001",
      },
    ],
  });
  assert.equal(payload.evaluations[0].segment_key, "enterprise");

  assert.throws(
    () =>
      parseBody(CriteriaEvaluateSchema, {
        evaluations: [
          {
            criteria_key: "quality.delivery",
            segment_key: "   ",
            subject_type: "project",
            subject_id: "00000000-0000-4000-8000-000000000001",
          },
        ],
      }),
    (err) => err.code === "validation_error"
  );
});

test("metrics/criteria schemas are imported in index.js", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(currentDir, "..", "src", "index.js"), "utf8");

  const expected = [
    "MetricDefinitionUpsertSchema",
    "MetricsIngestSchema",
    "MetricsQuerySchema",
    "MetricsExportSchema",
    "CriteriaEvaluateSchema",
    "registerMetricsRoutes",
  ];
  for (const name of expected) {
    assert.ok(source.includes(name), `Expected ${name} to be imported/used in index.js`);
  }
});

test("metrics route contract endpoints exist", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const routesDir = join(currentDir, "..", "src", "routes");
  const metricsRoutePathTs = join(routesDir, "metrics.ts");
  const metricsRoutePathJs = join(routesDir, "metrics.js");
  const metricsRoutePath = existsSync(metricsRoutePathTs) ? metricsRoutePathTs : metricsRoutePathJs;
  const metricsRouteSource = readFileSync(metricsRoutePath, "utf8");

  const endpoints = [
    "/metrics/definitions",
    "/metrics/ingest",
    "/metrics/query",
    "/metrics/export",
    "/criteria/evaluate",
    "/criteria/runs/:id",
  ];
  for (const endpoint of endpoints) {
    assert.ok(metricsRouteSource.includes(endpoint), `Expected endpoint ${endpoint} in metrics route module`);
  }
  assert.ok(
    metricsRouteSource.includes("criteria_evaluate:"),
    "Expected criteria evaluate idempotency key prefix in metrics route module"
  );
});
