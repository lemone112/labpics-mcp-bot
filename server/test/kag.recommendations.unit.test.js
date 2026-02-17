import test from "node:test";
import assert from "node:assert/strict";

import {
  generateRecommendations,
  RECOMMENDATION_CATEGORY,
} from "../src/kag/recommendations/index.js";
import { SIGNAL_KEYS } from "../src/kag/signals/index.js";
import { SCORE_TYPES } from "../src/kag/scoring/index.js";
import { evidence } from "./helpers.js";

function sig(signalKey, value, details = {}, evidenceRefs = []) {
  return { signal_key: signalKey, value, status: "ok", details, evidence_refs: evidenceRefs };
}

function score(scoreType, scoreValue, evidenceRefs = []) {
  return { score_type: scoreType, score: scoreValue, level: "low", evidence_refs: evidenceRefs };
}

const NOW = new Date("2026-02-17T12:00:00Z");

// ---------------------------------------------------------------------------
// RECOMMENDATION_CATEGORY
// ---------------------------------------------------------------------------

test("RECOMMENDATION_CATEGORY has 5 categories", () => {
  assert.equal(RECOMMENDATION_CATEGORY.WAITING, "waiting_on_client");
  assert.equal(RECOMMENDATION_CATEGORY.SCOPE, "scope_creep_change_request");
  assert.equal(RECOMMENDATION_CATEGORY.DELIVERY, "delivery_risk");
  assert.equal(RECOMMENDATION_CATEGORY.FINANCE, "finance_risk");
  assert.equal(RECOMMENDATION_CATEGORY.UPSELL, "upsell_opportunity");
});

// ---------------------------------------------------------------------------
// Waiting recommendation
// ---------------------------------------------------------------------------

test("waiting recommendation triggers at waiting >= 2 days with evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, 3, {}, [evidence({ message_id: "m1" })]),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 0, { approval_pending: false, stage_name: "Design" }),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 80), score(SCORE_TYPES.RISK, 20)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.WAITING);
  assert.ok(rec, "waiting recommendation should be generated");
  assert.ok(rec.evidence_refs.length > 0);
  assert.ok(rec.dedupe_key);
  assert.ok(rec.suggested_template);
});

test("waiting recommendation priority escalates to 5 when >= 4 days", async () => {
  const signals = [
    sig(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, 5, {}, [evidence({ message_id: "m1" })]),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 0, { approval_pending: false }),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 60), score(SCORE_TYPES.RISK, 40)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.WAITING);
  assert.equal(rec.priority, 5);
});

// ---------------------------------------------------------------------------
// Scope recommendation
// ---------------------------------------------------------------------------

test("scope recommendation triggers at scope_creep_rate >= 0.2 with evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.25, { scope_requests_7d: 3, client_requests_7d: 10 }, [evidence({ message_id: "s1" })]),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 70), score(SCORE_TYPES.RISK, 30)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.SCOPE);
  assert.ok(rec, "scope recommendation should be generated");
  assert.ok(rec.evidence_refs.length > 0);
});

test("scope recommendation triggers when scope_requests_7d >= 2 even if rate < 0.2", async () => {
  const signals = [
    sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.1, { scope_requests_7d: 2, client_requests_7d: 20 }, [evidence({ doc_url: "http://x" })]),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 80), score(SCORE_TYPES.RISK, 20)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.SCOPE);
  assert.ok(rec, "scope recommendation should trigger on request count >= 2");
});

test("scope recommendation priority escalates to 5 at rate >= 0.35", async () => {
  const signals = [
    sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.4, { scope_requests_7d: 4, client_requests_7d: 10 }, [evidence({ message_id: "s2" })]),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 50), score(SCORE_TYPES.RISK, 50)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.SCOPE);
  assert.equal(rec.priority, 5);
});

// ---------------------------------------------------------------------------
// Delivery recommendation
// ---------------------------------------------------------------------------

test("delivery recommendation triggers at blockers > 3 + age > 5 with evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.BLOCKERS_AGE, 6, { open_blockers: 4 }, [evidence({ linear_issue_id: "L1" })]),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 0),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 50), score(SCORE_TYPES.RISK, 60)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.DELIVERY);
  assert.ok(rec, "delivery recommendation should be generated");
  assert.equal(rec.priority, 5);
});

test("delivery recommendation triggers at stageOverdue > 1 with evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.BLOCKERS_AGE, 0, { open_blockers: 0 }),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 2, { stage_name: "Testing" }, [evidence({ doc_url: "http://stage" })]),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 60), score(SCORE_TYPES.RISK, 40)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.DELIVERY);
  assert.ok(rec, "delivery recommendation should trigger on stage overdue > 1");
});

// ---------------------------------------------------------------------------
// Finance recommendation
// ---------------------------------------------------------------------------

test("finance recommendation triggers at burn > 1.1 with evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.BUDGET_BURN_RATE, 1.15, {}, [evidence({ attio_record_id: "d1" })]),
    sig(SIGNAL_KEYS.MARGIN_RISK, 0.1),
  ];
  const scores = [score(SCORE_TYPES.RISK, 40), score(SCORE_TYPES.CLIENT_VALUE, 60)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.FINANCE);
  assert.ok(rec, "finance recommendation should be generated");
  assert.equal(rec.priority, 4);
});

test("finance recommendation priority escalates to 5 at burn >= 1.2", async () => {
  const signals = [
    sig(SIGNAL_KEYS.BUDGET_BURN_RATE, 1.25, {}, [evidence({ attio_record_id: "d2" })]),
    sig(SIGNAL_KEYS.MARGIN_RISK, 0.15),
  ];
  const scores = [score(SCORE_TYPES.RISK, 50), score(SCORE_TYPES.CLIENT_VALUE, 60)];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.FINANCE);
  assert.equal(rec.priority, 5);
});

// ---------------------------------------------------------------------------
// Upsell recommendation
// ---------------------------------------------------------------------------

test("upsell recommendation triggers at upsell_score >= 65 with recent needs + evidence", async () => {
  const needTs = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const signals = [
    sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.1),
  ];
  const scores = [
    score(SCORE_TYPES.UPSELL_LIKELIHOOD, 70),
    score(SCORE_TYPES.CLIENT_VALUE, 75),
  ];
  const state = {
    needs: {
      events: [needTs],
      evidence: [evidence({ message_id: "need-1" })],
    },
  };
  const recs = await generateRecommendations({ signals, scores, state, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.UPSELL);
  assert.ok(rec, "upsell recommendation should be generated");
  assert.equal(rec.priority, 4);
});

test("upsell priority escalates to 5 at upsell_score >= 80", async () => {
  const needTs = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const signals = [sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.1)];
  const scores = [score(SCORE_TYPES.UPSELL_LIKELIHOOD, 85), score(SCORE_TYPES.CLIENT_VALUE, 80)];
  const state = { needs: { events: [needTs], evidence: [evidence({ message_id: "n2" })] } };
  const recs = await generateRecommendations({ signals, scores, state, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.UPSELL);
  assert.equal(rec.priority, 5);
});

// ---------------------------------------------------------------------------
// Evidence gating — no recommendation without evidence
// ---------------------------------------------------------------------------

test("no waiting recommendation without evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, 5, {}, []),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 0),
  ];
  const recs = await generateRecommendations({ signals, scores: [], state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.WAITING);
  assert.equal(rec, undefined, "no recommendation without evidence");
});

test("no finance recommendation without evidence", async () => {
  const signals = [
    sig(SIGNAL_KEYS.BUDGET_BURN_RATE, 1.3, {}, []),
    sig(SIGNAL_KEYS.MARGIN_RISK, 0.5, {}, []),
  ];
  const recs = await generateRecommendations({ signals, scores: [], state: {}, now: NOW });
  const rec = recs.find((r) => r.category === RECOMMENDATION_CATEGORY.FINANCE);
  assert.equal(rec, undefined, "no recommendation without evidence");
});

// ---------------------------------------------------------------------------
// Sorting by priority descending
// ---------------------------------------------------------------------------

test("recommendations are sorted by priority descending", async () => {
  const signals = [
    sig(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, 5, {}, [evidence({ message_id: "w1" })]),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 2, { stage_name: "Test" }, [evidence({ doc_url: "http://s" })]),
    sig(SIGNAL_KEYS.BLOCKERS_AGE, 6, { open_blockers: 4 }, [evidence({ linear_issue_id: "L1" })]),
    sig(SIGNAL_KEYS.SCOPE_CREEP_RATE, 0.25, { scope_requests_7d: 3, client_requests_7d: 10 }, [evidence({ message_id: "sc1" })]),
    sig(SIGNAL_KEYS.BUDGET_BURN_RATE, 1.05, {}, [evidence({ attio_record_id: "f1" })]),
    sig(SIGNAL_KEYS.MARGIN_RISK, 0.3, {}, [evidence({ attio_record_id: "f2" })]),
  ];
  const scores = [
    score(SCORE_TYPES.PROJECT_HEALTH, 40),
    score(SCORE_TYPES.RISK, 60),
    score(SCORE_TYPES.CLIENT_VALUE, 50),
  ];
  const recs = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  assert.ok(recs.length >= 2, "should have multiple recommendations");
  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i - 1].priority >= recs[i].priority, "sorted descending by priority");
  }
});

// ---------------------------------------------------------------------------
// dedupe_key is present and deterministic
// ---------------------------------------------------------------------------

test("dedupe_key is deterministic for same inputs", async () => {
  const signals = [
    sig(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, 3, {}, [evidence({ message_id: "d1" })]),
    sig(SIGNAL_KEYS.STAGE_OVERDUE, 0),
  ];
  const scores = [score(SCORE_TYPES.PROJECT_HEALTH, 70), score(SCORE_TYPES.RISK, 30)];
  const recs1 = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  const recs2 = await generateRecommendations({ signals, scores, state: {}, now: NOW });
  assert.equal(recs1[0].dedupe_key, recs2[0].dedupe_key);
});
