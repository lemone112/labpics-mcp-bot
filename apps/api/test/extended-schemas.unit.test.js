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
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const connectorRouteSource = readFileSync(join(currentDir, "..", "src", "routes", "connectors.js"), "utf8");

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
