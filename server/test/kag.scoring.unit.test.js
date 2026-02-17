import test from "node:test";
import assert from "node:assert/strict";

import { computeScores, SCORE_TYPES } from "../src/kag/scoring/index.js";
import {
  createInitialSignalState,
  computeSignalsFromState,
  applyEventToSignalState,
  SIGNAL_KEYS,
} from "../src/kag/signals/index.js";
import { event, evidence } from "./helpers.js";

function zeroSignals(now) {
  const state = createInitialSignalState(now);
  return computeSignalsFromState(state, { now });
}

// ---------------------------------------------------------------------------
// SCORE_TYPES
// ---------------------------------------------------------------------------

test("SCORE_TYPES has 4 entries", () => {
  assert.equal(Object.keys(SCORE_TYPES).length, 4);
  assert.equal(SCORE_TYPES.PROJECT_HEALTH, "project_health");
  assert.equal(SCORE_TYPES.RISK, "risk");
  assert.equal(SCORE_TYPES.CLIENT_VALUE, "client_value");
  assert.equal(SCORE_TYPES.UPSELL_LIKELIHOOD, "upsell_likelihood");
});

// ---------------------------------------------------------------------------
// computeScores — zero state
// ---------------------------------------------------------------------------

test("computeScores with zero signals gives health=100, risk=0", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const signals = zeroSignals(now);
  const { scores, score_map } = computeScores({ signals, state: {}, now });

  assert.equal(scores.length, 4);
  assert.equal(score_map[SCORE_TYPES.PROJECT_HEALTH].score, 100);
  assert.equal(score_map[SCORE_TYPES.RISK].score, 0);
});

// ---------------------------------------------------------------------------
// computeScores — structure of each score
// ---------------------------------------------------------------------------

test("each score has required structure fields", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const { scores } = computeScores({ signals: zeroSignals(now), state: {}, now });

  for (const s of scores) {
    assert.ok(s.score_type, "score must have score_type");
    assert.equal(typeof s.score, "number");
    assert.ok(["low", "medium", "high", "critical"].includes(s.level));
    assert.ok(s.weights && typeof s.weights === "object");
    assert.ok(Array.isArray(s.factors));
    assert.ok(Array.isArray(s.evidence_refs));
    assert.ok(s.computed_at);
  }
});

// ---------------------------------------------------------------------------
// Score level mapping — PROJECT_HEALTH
// ---------------------------------------------------------------------------

test("PROJECT_HEALTH level: 100 → low", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const { score_map } = computeScores({ signals: zeroSignals(now), state: {}, now });
  assert.equal(score_map[SCORE_TYPES.PROJECT_HEALTH].level, "low");
});

test("PROJECT_HEALTH level: high risk signals → score drops, level rises", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  // Many blockers + overdue stage + high burn
  for (let i = 0; i < 5; i++) {
    applyEventToSignalState(state, event(i + 1, "task_blocked", `2026-02-05T${String(9 + i).padStart(2, "0")}:00:00Z`, { blocker_id: `b${i}` }, [evidence({ linear_issue_id: `L${i}` })]), { now });
  }
  applyEventToSignalState(state, event(10, "stage_started", "2026-02-10T09:00:00Z", { stage_id: "s1", due_at: "2026-02-12T00:00:00Z" }), { now });
  applyEventToSignalState(state, event(11, "finance_entry_created", "2026-02-10T10:00:00Z", { entry_type: "budget", amount: 1000 }, [evidence({ attio_record_id: "d1" })]), { now });
  applyEventToSignalState(state, event(12, "finance_entry_created", "2026-02-10T11:00:00Z", { entry_type: "cost", amount: 2000 }, [evidence({ attio_record_id: "d2" })]), { now });

  const signals = computeSignalsFromState(state, { now });
  const { score_map } = computeScores({ signals, state, now });
  assert.ok(score_map[SCORE_TYPES.PROJECT_HEALTH].score < 60, "health should be below 60");
  assert.ok(["high", "critical"].includes(score_map[SCORE_TYPES.PROJECT_HEALTH].level));
});

// ---------------------------------------------------------------------------
// Score level mapping — RISK
// ---------------------------------------------------------------------------

test("RISK level: 0 → low", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const { score_map } = computeScores({ signals: zeroSignals(now), state: {}, now });
  assert.equal(score_map[SCORE_TYPES.RISK].level, "low");
  assert.equal(score_map[SCORE_TYPES.RISK].score, 0);
});

// ---------------------------------------------------------------------------
// Score level mapping — CLIENT_VALUE
// ---------------------------------------------------------------------------

test("CLIENT_VALUE with zero state → depends on stability and base sentiment", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const signals = computeSignalsFromState(state, { now });
  const { score_map } = computeScores({ signals, state, now });
  // With health=100 (stability=100), sentiment=0 (score=50), revenue=0, margin=100, engagement=100
  // Weighted: 0.3*0 + 0.25*100 + 0.2*100 + 0.1*50 + 0.15*100 = 0+25+20+5+15 = 65
  assert.ok(score_map[SCORE_TYPES.CLIENT_VALUE].score >= 60);
  assert.ok(score_map[SCORE_TYPES.CLIENT_VALUE].score <= 70);
  assert.equal(score_map[SCORE_TYPES.CLIENT_VALUE].level, "medium");
});

test("CLIENT_VALUE high when revenue is high and stable", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "finance_entry_created", "2026-02-10T10:00:00Z", { entry_type: "revenue", amount: 200_000 }), { now });
  applyEventToSignalState(state, event(2, "message_sent", "2026-02-15T10:00:00Z", { sender: "client", sentiment_score: 0.9 }), { now });

  const signals = computeSignalsFromState(state, { now });
  const { score_map } = computeScores({ signals, state, now });
  assert.ok(score_map[SCORE_TYPES.CLIENT_VALUE].score >= 75);
});

// ---------------------------------------------------------------------------
// Score level mapping — UPSELL_LIKELIHOOD
// ---------------------------------------------------------------------------

test("UPSELL_LIKELIHOOD increases with need signals and client value", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "finance_entry_created", "2026-02-10T10:00:00Z", { entry_type: "revenue", amount: 200_000 }), { now });
  applyEventToSignalState(state, event(2, "need_detected", "2026-02-16T10:00:00Z", {}, [evidence({ message_id: "n1" })]), { now });
  applyEventToSignalState(state, event(3, "need_detected", "2026-02-16T11:00:00Z", {}, [evidence({ message_id: "n2" })]), { now });

  const signals = computeSignalsFromState(state, { now });
  const { score_map } = computeScores({ signals, state, now });
  assert.ok(score_map[SCORE_TYPES.UPSELL_LIKELIHOOD].score >= 50, "upsell should be moderate+");
});

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

test("evidence_refs are deduplicated across signals", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const sharedEvidence = evidence({ message_id: "shared-1" });
  applyEventToSignalState(state, event(1, "message_sent", "2026-02-17T10:00:00Z", { sender: "client" }, [sharedEvidence]), { now });
  applyEventToSignalState(state, event(2, "scope_change_requested", "2026-02-17T11:00:00Z", {}, [sharedEvidence]), { now });

  const signals = computeSignalsFromState(state, { now });
  const { scores } = computeScores({ signals, state, now });
  // Evidence should be deduplicated
  const allRefs = scores[0].evidence_refs;
  const keys = new Set(allRefs.map((r) => JSON.stringify(r)));
  assert.equal(allRefs.length, keys.size, "no duplicate evidence refs");
});

// ---------------------------------------------------------------------------
// Edge: NaN/undefined signals graceful fallback
// ---------------------------------------------------------------------------

test("computeScores with empty signals array returns valid scores", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const { scores } = computeScores({ signals: [], state: {}, now });
  assert.equal(scores.length, 4);
  for (const s of scores) {
    assert.ok(Number.isFinite(s.score));
  }
});
