import test from "node:test";
import assert from "node:assert/strict";

import { applyEventsIncrementally, computeSignalsFromState, createInitialSignalState, mapSignalsByKey } from "../src/kag/signals/index.js";
import { computeScores, SCORE_TYPES } from "../src/kag/scoring/index.js";
import { generateRecommendations, RECOMMENDATION_CATEGORY } from "../src/kag/recommendations/index.js";

function event(id, eventType, eventTs, payload = {}, evidenceRefs = []) {
  return {
    id,
    event_type: eventType,
    event_ts: eventTs,
    payload,
    evidence_refs: evidenceRefs,
  };
}

function evidence(overrides = {}) {
  return {
    message_id: overrides.message_id || null,
    linear_issue_id: overrides.linear_issue_id || null,
    attio_record_id: overrides.attio_record_id || null,
    doc_url: overrides.doc_url || null,
    rag_chunk_id: overrides.rag_chunk_id || null,
  };
}

function scoreMap(scores) {
  const out = {};
  for (const score of scores) out[score.score_type] = score;
  return out;
}

async function runPipeline(events, nowIso) {
  const now = new Date(nowIso);
  const initialState = createInitialSignalState(now);
  const { state } = applyEventsIncrementally(initialState, events, { now });
  const signals = computeSignalsFromState(state, { now });
  const scoring = computeScores({ signals, state, now });
  const recommendations = await generateRecommendations({
    signals,
    scores: scoring.scores,
    state,
    now,
  });
  return {
    now,
    state,
    signals,
    signalMap: mapSignalsByKey(signals),
    scores: scoring.scores,
    scoreMap: scoreMap(scoring.scores),
    recommendations,
  };
}

test("scenario: client silent 4 days on approval -> follow-up recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(
      1,
      "stage_started",
      "2026-02-13T09:00:00.000Z",
      { stage_id: "approval_stage", stage_name: "Client approval", approval_pending: true },
      [evidence({ doc_url: "https://docs.example.com/approval" })]
    ),
    event(
      2,
      "message_sent",
      "2026-02-13T10:00:00.000Z",
      { sender: "team" },
      [evidence({ message_id: "msg-team-1" })]
    ),
  ];

  const result = await runPipeline(events, now);
  const waitingSignal = result.signalMap.waiting_on_client_days;
  assert.ok(waitingSignal.value >= 3.9, "waiting signal should be around 4 days");
  const followUp = result.recommendations.find((item) => item.category === RECOMMENDATION_CATEGORY.WAITING);
  assert.ok(followUp, "waiting_on_client recommendation is expected");
  assert.ok(followUp.priority >= 4);
  assert.ok(followUp.evidence_refs.length > 0);
  assert.match(followUp.suggested_template, /апрув|подтвержден/i);
});

test("scenario: 2 out-of-scope requests in a week -> CR recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(1, "message_sent", "2026-02-12T09:00:00.000Z", { sender: "client" }, [evidence({ message_id: "m1" })]),
    event(2, "message_sent", "2026-02-13T09:00:00.000Z", { sender: "client" }, [evidence({ message_id: "m2" })]),
    event(3, "scope_change_requested", "2026-02-13T10:00:00.000Z", {}, [evidence({ message_id: "m2" })]),
    event(4, "message_sent", "2026-02-15T09:00:00.000Z", { sender: "client" }, [evidence({ message_id: "m3" })]),
    event(5, "scope_change_requested", "2026-02-16T09:00:00.000Z", {}, [evidence({ message_id: "m3" })]),
  ];

  const result = await runPipeline(events, now);
  const scopeSignal = result.signalMap.scope_creep_rate;
  assert.ok(scopeSignal.value >= 0.2);
  const rec = result.recommendations.find((item) => item.category === RECOMMENDATION_CATEGORY.SCOPE);
  assert.ok(rec, "scope_creep_change_request recommendation is expected");
  assert.ok(rec.evidence_refs.length > 0);
  assert.match(rec.suggested_template, /Change Request|scope/i);
});

test("scenario: blockers >3 and older than 5 days -> delivery risk recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(1, "task_blocked", "2026-02-10T09:00:00.000Z", { blocker_id: "b1", task_id: "t1" }, [evidence({ linear_issue_id: "LIN-1" })]),
    event(2, "task_blocked", "2026-02-10T10:00:00.000Z", { blocker_id: "b2", task_id: "t2" }, [evidence({ linear_issue_id: "LIN-2" })]),
    event(3, "task_blocked", "2026-02-10T11:00:00.000Z", { blocker_id: "b3", task_id: "t3" }, [evidence({ linear_issue_id: "LIN-3" })]),
    event(4, "task_blocked", "2026-02-10T12:00:00.000Z", { blocker_id: "b4", task_id: "t4" }, [evidence({ linear_issue_id: "LIN-4" })]),
  ];

  const result = await runPipeline(events, now);
  const blockersSignal = result.signalMap.blockers_age;
  assert.ok(blockersSignal.value > 5);
  assert.equal(blockersSignal.details.open_blockers, 4);
  const rec = result.recommendations.find((item) => item.category === RECOMMENDATION_CATEGORY.DELIVERY);
  assert.ok(rec, "delivery_risk recommendation is expected");
  assert.ok(rec.priority >= 4);
  assert.ok(rec.evidence_refs.length > 0);
});

test("scenario: burn rate above plan by 20% -> finance risk recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(
      1,
      "finance_entry_created",
      "2026-02-10T10:00:00.000Z",
      { entry_type: "planned_budget", amount: 10_000 },
      [evidence({ attio_record_id: "deal-1" })]
    ),
    event(
      2,
      "finance_entry_created",
      "2026-02-15T10:00:00.000Z",
      { entry_type: "cost", amount: 12_000 },
      [evidence({ attio_record_id: "deal-1" })]
    ),
  ];

  const result = await runPipeline(events, now);
  const burnSignal = result.signalMap.budget_burn_rate;
  assert.ok(burnSignal.value >= 1.2);
  const rec = result.recommendations.find((item) => item.category === RECOMMENDATION_CATEGORY.FINANCE);
  assert.ok(rec, "finance_risk recommendation is expected");
  assert.ok(rec.evidence_refs.length > 0);
  assert.match(rec.suggested_template, /burn|марж/i);
});

test("scenario: need detected in conversation -> upsell recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(
      1,
      "finance_entry_created",
      "2026-02-12T10:00:00.000Z",
      { entry_type: "revenue", amount: 120_000 },
      [evidence({ attio_record_id: "deal-upsell-1" })]
    ),
    event(
      2,
      "need_detected",
      "2026-02-16T12:00:00.000Z",
      { source: "conversation", message_id: "need-1" },
      [evidence({ message_id: "need-1", rag_chunk_id: "chunk-need-1" })]
    ),
  ];

  const result = await runPipeline(events, now);
  assert.ok(result.scoreMap[SCORE_TYPES.UPSELL_LIKELIHOOD].score >= 65);
  const rec = result.recommendations.find((item) => item.category === RECOMMENDATION_CATEGORY.UPSELL);
  assert.ok(rec, "upsell_opportunity recommendation is expected");
  assert.ok(rec.evidence_refs.length > 0);
  assert.match(rec.suggested_template, /оффер|вариант|ROI/i);
});

test("guardrail: no recommendations without evidence", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(1, "stage_started", "2026-02-13T09:00:00.000Z", { stage_name: "Approval", approval_pending: true }, []),
    event(2, "message_sent", "2026-02-13T10:00:00.000Z", { sender: "team" }, []),
    event(3, "finance_entry_created", "2026-02-14T10:00:00.000Z", { entry_type: "planned_budget", amount: 1_000 }, []),
    event(4, "finance_entry_created", "2026-02-14T11:00:00.000Z", { entry_type: "cost", amount: 2_000 }, []),
  ];

  const result = await runPipeline(events, now);
  assert.equal(result.recommendations.length, 0, "all recommendations must be filtered without evidence");
});

test("incremental update: response time updates after team reply", () => {
  const now = new Date("2026-02-17T12:00:00.000Z");
  const initial = createInitialSignalState(now);
  const batch1 = [
    event(1, "message_sent", "2026-02-17T08:00:00.000Z", { sender: "client" }, [evidence({ message_id: "m-client-1" })]),
  ];
  const step1 = applyEventsIncrementally(initial, batch1, { now });
  const signals1 = mapSignalsByKey(computeSignalsFromState(step1.state, { now }));
  assert.equal(signals1.response_time_avg.value, 0);

  const batch2 = [
    event(2, "message_sent", "2026-02-17T10:00:00.000Z", { sender: "team" }, [evidence({ message_id: "m-team-1" })]),
  ];
  const step2 = applyEventsIncrementally(step1.state, batch2, { now });
  const signals2 = mapSignalsByKey(computeSignalsFromState(step2.state, { now }));
  assert.equal(signals2.response_time_avg.details.samples, 1);
  assert.ok(signals2.response_time_avg.value >= 119 && signals2.response_time_avg.value <= 121);
});

test("signal: activity drop is detected between two weeks", () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    event(1, "message_sent", "2026-02-05T10:00:00.000Z", { sender: "client" }, [evidence({ message_id: "a1" })]),
    event(2, "message_sent", "2026-02-05T11:00:00.000Z", { sender: "team" }, [evidence({ message_id: "a2" })]),
    event(3, "message_sent", "2026-02-06T10:00:00.000Z", { sender: "client" }, [evidence({ message_id: "a3" })]),
    event(4, "message_sent", "2026-02-06T11:00:00.000Z", { sender: "team" }, [evidence({ message_id: "a4" })]),
    event(5, "message_sent", "2026-02-07T10:00:00.000Z", { sender: "client" }, [evidence({ message_id: "a5" })]),
    event(6, "message_sent", "2026-02-16T10:00:00.000Z", { sender: "team" }, [evidence({ message_id: "a6" })]),
  ];

  const initial = createInitialSignalState(new Date(now));
  const { state } = applyEventsIncrementally(initial, events, { now: new Date(now) });
  const signals = mapSignalsByKey(computeSignalsFromState(state, { now: new Date(now) }));
  assert.ok(signals.activity_drop.value >= 0.5);
  assert.ok(["warn", "critical"].includes(signals.activity_drop.status));
});
