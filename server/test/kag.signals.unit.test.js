import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialSignalState,
  applyEventToSignalState,
  applyEventsIncrementally,
  computeSignalsFromState,
  mapSignalsByKey,
  SIGNAL_KEYS,
  signalDefinition,
} from "../src/kag/signals/index.js";
import { event, evidence } from "./helpers.js";

// ---------------------------------------------------------------------------
// createInitialSignalState
// ---------------------------------------------------------------------------

test("createInitialSignalState returns valid structure", () => {
  const state = createInitialSignalState(new Date("2026-01-01T00:00:00Z"));
  assert.equal(state.version, 1);
  assert.equal(state.waiting.last_client_message_at, null);
  assert.equal(state.waiting.last_team_message_at, null);
  assert.deepEqual(state.response.pending_client_messages, []);
  assert.equal(state.response.total_minutes, 0);
  assert.equal(state.response.samples, 0);
  assert.deepEqual(state.blockers.open, {});
  assert.equal(state.stage.stage_id, null);
  assert.equal(state.stage.status, "unknown");
  assert.deepEqual(state.agreements.open, {});
  assert.equal(state.sentiment.ewma, 0);
  assert.equal(state.sentiment.samples, 0);
  assert.deepEqual(state.scope.requests, []);
  assert.equal(state.finance.planned_budget, 0);
  assert.deepEqual(state.activity.daily_counts, {});
  assert.deepEqual(state.evidence_by_signal, {});
  assert.equal(state.cursor.last_event_id, 0);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — message_sent (client)
// ---------------------------------------------------------------------------

test("message_sent from client updates waiting and response state", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const ev = event(1, "message_sent", "2026-02-17T10:00:00Z", { sender: "client" }, [evidence({ message_id: "m1" })]);
  applyEventToSignalState(state, ev, { now });

  assert.equal(state.waiting.last_client_message_at, "2026-02-17T10:00:00.000Z");
  assert.equal(state.response.pending_client_messages.length, 1);
  assert.ok(state.evidence_by_signal[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS]?.length > 0);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — message_sent (team) clears pending + computes response
// ---------------------------------------------------------------------------

test("message_sent from team computes response time", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  // Client message at 08:00
  applyEventToSignalState(state, event(1, "message_sent", "2026-02-17T08:00:00Z", { sender: "client" }, [evidence({ message_id: "c1" })]), { now });
  // Team reply at 10:00 → 120 min response
  applyEventToSignalState(state, event(2, "message_sent", "2026-02-17T10:00:00Z", { sender: "team" }, [evidence({ message_id: "t1" })]), { now });

  assert.equal(state.response.samples, 1);
  assert.ok(state.response.total_minutes >= 119 && state.response.total_minutes <= 121);
  assert.equal(state.response.pending_client_messages.length, 0);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — message_sent with sentiment
// ---------------------------------------------------------------------------

test("message_sent with sentiment_score updates EWMA", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "message_sent", "2026-02-17T10:00:00Z", { sender: "client", sentiment_score: 0.8 }), { now });

  assert.equal(state.sentiment.samples, 1);
  assert.equal(state.sentiment.ewma, 0.8, "first sample should set ewma directly");
  assert.equal(state.sentiment.prev_ewma, 0);
});

test("sentiment EWMA follows exponential weighting on second sample", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "message_sent", "2026-02-17T09:00:00Z", { sender: "client", sentiment_score: 0.8 }), { now });
  applyEventToSignalState(state, event(2, "message_sent", "2026-02-17T10:00:00Z", { sender: "client", sentiment_score: -0.2 }), { now });

  assert.equal(state.sentiment.samples, 2);
  // alpha=0.35, ewma = 0.35*(-0.2) + 0.65*0.8 = -0.07 + 0.52 = 0.45
  assert.ok(Math.abs(state.sentiment.ewma - 0.45) < 0.01);
  assert.equal(state.sentiment.prev_ewma, 0.8);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — task_blocked / blocker_resolved
// ---------------------------------------------------------------------------

test("task_blocked opens a blocker, blocker_resolved closes it", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "task_blocked", "2026-02-17T09:00:00Z", { blocker_id: "b1" }, [evidence({ linear_issue_id: "L1" })]), { now });
  assert.ok(state.blockers.open["b1"]);

  applyEventToSignalState(state, event(2, "blocker_resolved", "2026-02-17T10:00:00Z", { blocker_id: "b1" }), { now });
  assert.equal(state.blockers.open["b1"], undefined);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — stage_started / stage_completed
// ---------------------------------------------------------------------------

test("stage_started sets stage fields", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "stage_started", "2026-02-15T09:00:00Z", {
    stage_id: "s1",
    stage_name: "Design",
    due_at: "2026-02-20T00:00:00Z",
    approval_pending: true,
  }), { now });

  assert.equal(state.stage.stage_id, "s1");
  assert.equal(state.stage.stage_name, "Design");
  assert.equal(state.stage.status, "active");
  assert.equal(state.stage.approval_pending, true);
  assert.ok(state.stage.due_at);
});

test("stage_completed marks stage as completed", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "stage_started", "2026-02-15T09:00:00Z", { stage_id: "s1" }), { now });
  applyEventToSignalState(state, event(2, "stage_completed", "2026-02-17T09:00:00Z", {}), { now });

  assert.equal(state.stage.status, "completed");
  assert.equal(state.stage.approval_pending, false);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — agreement_created / approval_approved
// ---------------------------------------------------------------------------

test("agreement_created and approval_approved manage agreements map", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "agreement_created", "2026-02-15T09:00:00Z", {
    agreement_id: "a1",
    due_at: "2026-02-16T00:00:00Z",
  }), { now });
  assert.ok(state.agreements.open["a1"]);

  applyEventToSignalState(state, event(2, "approval_approved", "2026-02-16T09:00:00Z", { agreement_id: "a1" }), { now });
  assert.equal(state.agreements.open["a1"], undefined);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — scope_change_requested
// ---------------------------------------------------------------------------

test("scope_change_requested pushes to scope.requests", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "scope_change_requested", "2026-02-17T10:00:00Z", {}, [evidence({ doc_url: "http://x" })]), { now });

  assert.equal(state.scope.requests.length, 1);
  assert.ok(state.evidence_by_signal[SIGNAL_KEYS.SCOPE_CREEP_RATE]?.length > 0);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — finance_entry_created
// ---------------------------------------------------------------------------

test("finance_entry_created accumulates budget, cost, revenue", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "finance_entry_created", "2026-02-17T09:00:00Z", { entry_type: "budget", amount: 5000 }), { now });
  applyEventToSignalState(state, event(2, "finance_entry_created", "2026-02-17T10:00:00Z", { entry_type: "cost", amount: 3000 }), { now });
  applyEventToSignalState(state, event(3, "finance_entry_created", "2026-02-17T11:00:00Z", { entry_type: "revenue", amount: 7000 }), { now });

  assert.equal(state.finance.planned_budget, 5000);
  assert.equal(state.finance.actual_cost, 3000);
  assert.equal(state.finance.revenue, 7000);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — need_detected
// ---------------------------------------------------------------------------

test("need_detected pushes to needs.events", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "need_detected", "2026-02-17T10:00:00Z", {}, [evidence({ message_id: "n1" })]), { now });

  assert.equal(state.needs.events.length, 1);
  assert.ok(state.needs.evidence.length > 0);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — generic activity events
// ---------------------------------------------------------------------------

test("decision_made / offer_created / task_created only increment activity", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  for (const eventType of ["decision_made", "offer_created", "task_created"]) {
    applyEventToSignalState(state, event(1, eventType, "2026-02-17T10:00:00Z", {}), { now });
  }
  const dayKey = "2026-02-17";
  assert.equal(state.activity.daily_counts[dayKey], 3);
});

// ---------------------------------------------------------------------------
// applyEventToSignalState — empty event_type
// ---------------------------------------------------------------------------

test("empty event_type returns state unchanged", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const before = JSON.stringify(state);
  applyEventToSignalState(state, { event_type: "", event_ts: "2026-02-17T10:00:00Z" }, { now });
  assert.equal(JSON.stringify(state), before);
});

test("null event_type returns state unchanged", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const before = JSON.stringify(state);
  applyEventToSignalState(state, { event_type: null, event_ts: "2026-02-17T10:00:00Z" }, { now });
  assert.equal(JSON.stringify(state), before);
});

// ---------------------------------------------------------------------------
// applyEventsIncrementally
// ---------------------------------------------------------------------------

test("applyEventsIncrementally sorts by id and isolates via structuredClone", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const initial = createInitialSignalState(now);
  const events = [
    event(3, "message_sent", "2026-02-17T11:00:00Z", { sender: "client" }, [evidence({ message_id: "m3" })]),
    event(1, "message_sent", "2026-02-17T09:00:00Z", { sender: "client" }, [evidence({ message_id: "m1" })]),
    event(2, "message_sent", "2026-02-17T10:00:00Z", { sender: "team" }, [evidence({ message_id: "m2" })]),
  ];
  const result = applyEventsIncrementally(initial, events, { now });

  assert.equal(result.processed_events, 3);
  assert.equal(result.last_event_id, 3);
  // Original state should not be mutated
  assert.equal(initial.response.samples, 0);
  // Result state should have the team response
  assert.equal(result.state.response.samples, 1);
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — structural checks
// ---------------------------------------------------------------------------

test("computeSignalsFromState returns 10 signals with correct structure", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const signals = computeSignalsFromState(state, { now });

  assert.equal(signals.length, 10);
  for (const signal of signals) {
    assert.ok(signal.signal_key, "signal must have signal_key");
    assert.equal(typeof signal.value, "number");
    assert.ok(["ok", "warn", "critical"].includes(signal.status));
    assert.ok(Array.isArray(signal.evidence_refs));
  }
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — waiting on client
// ---------------------------------------------------------------------------

test("waiting_on_client_days is 0 when no team message", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.equal(signalMap[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS].value, 0);
});

test("waiting_on_client_days reflects time since team message when team spoke last", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "message_sent", "2026-02-15T12:00:00Z", { sender: "team" }), { now });
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.ok(signalMap[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS].value >= 1.9);
  assert.ok(signalMap[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS].value <= 2.1);
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — response time average
// ---------------------------------------------------------------------------

test("response_time_avg is 0 with no samples", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.equal(signalMap[SIGNAL_KEYS.RESPONSE_TIME_AVG].value, 0);
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — budget burn rate edge cases
// ---------------------------------------------------------------------------

test("budget_burn_rate is 1.5 when cost > 0 but no budget", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "finance_entry_created", "2026-02-17T09:00:00Z", { entry_type: "cost", amount: 500 }), { now });
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.equal(signalMap[SIGNAL_KEYS.BUDGET_BURN_RATE].value, 1.5);
});

test("budget_burn_rate is 0 when no cost and no budget", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.equal(signalMap[SIGNAL_KEYS.BUDGET_BURN_RATE].value, 0);
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — margin risk edge case
// ---------------------------------------------------------------------------

test("margin_risk is 1.0 when cost > 0 but revenue = 0", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  applyEventToSignalState(state, event(1, "finance_entry_created", "2026-02-17T09:00:00Z", { entry_type: "cost", amount: 1000 }), { now });
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  assert.equal(signalMap[SIGNAL_KEYS.MARGIN_RISK].value, 1);
});

// ---------------------------------------------------------------------------
// computeSignalsFromState — activity drop between weeks
// ---------------------------------------------------------------------------

test("activity_drop reflects drop between current and previous 7-day window", () => {
  const now = new Date("2026-02-17T12:00:00Z");
  const state = createInitialSignalState(now);
  // Previous week: 5 events
  for (let i = 0; i < 5; i++) {
    applyEventToSignalState(state, event(i + 1, "message_sent", `2026-02-${String(5 + i).padStart(2, "0")}T10:00:00Z`, { sender: "client" }), { now });
  }
  // Current week: 1 event
  applyEventToSignalState(state, event(10, "message_sent", "2026-02-16T10:00:00Z", { sender: "client" }), { now });
  const signalMap = mapSignalsByKey(computeSignalsFromState(state, { now }));
  // Drop = (5-1)/5 = 0.8
  assert.ok(signalMap[SIGNAL_KEYS.ACTIVITY_DROP].value >= 0.7);
});

// ---------------------------------------------------------------------------
// mapSignalsByKey
// ---------------------------------------------------------------------------

test("mapSignalsByKey builds a key→signal dictionary", () => {
  const signals = [
    { signal_key: "a", value: 1 },
    { signal_key: "b", value: 2 },
  ];
  const map = mapSignalsByKey(signals);
  assert.equal(map["a"].value, 1);
  assert.equal(map["b"].value, 2);
});

test("mapSignalsByKey skips entries without signal_key", () => {
  const map = mapSignalsByKey([{ value: 1 }, { signal_key: "x", value: 2 }]);
  assert.equal(Object.keys(map).length, 1);
  assert.equal(map["x"].value, 2);
});

// ---------------------------------------------------------------------------
// signalDefinition
// ---------------------------------------------------------------------------

test("signalDefinition returns thresholds for known keys", () => {
  const def = signalDefinition(SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS);
  assert.equal(def.warn, 2);
  assert.equal(def.critical, 4);
  assert.equal(def.comparator, "high");
});

test("signalDefinition returns null for unknown key", () => {
  assert.equal(signalDefinition("unknown_signal"), null);
});

// ---------------------------------------------------------------------------
// SIGNAL_KEYS completeness
// ---------------------------------------------------------------------------

test("SIGNAL_KEYS has exactly 10 signals", () => {
  assert.equal(Object.keys(SIGNAL_KEYS).length, 10);
});
