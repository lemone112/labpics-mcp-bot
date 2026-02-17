import test from "node:test";
import assert from "node:assert/strict";

import { applyEventsIncrementally, computeSignalsFromState, createInitialSignalState } from "../src/kag/signals/index.js";
import { computeScores } from "../src/kag/scoring/index.js";
import { computeRiskForecastsFromInputs } from "../src/services/forecasting.js";
import {
  buildLoopsDraftPayloadFromAttioContact,
  generateRecommendationsV2FromInputs,
} from "../src/services/recommendations-v2.js";
import { rankSimilarCasesFromSignatures } from "../src/services/similarity.js";
import { composeSnapshotPayloadFromRows } from "../src/services/snapshots.js";
import { runKagRecommendationRefresh } from "../src/services/kag.js";

function ev(id, type, ts, payload = {}, evidenceRefs = []) {
  return { id, event_type: type, event_ts: ts, payload, evidence_refs: evidenceRefs };
}

function ref(overrides = {}) {
  return {
    message_id: overrides.message_id || null,
    linear_issue_id: overrides.linear_issue_id || null,
    attio_record_id: overrides.attio_record_id || null,
    doc_url: overrides.doc_url || null,
    rag_chunk_id: overrides.rag_chunk_id || null,
  };
}

function buildPipeline(events, nowIso) {
  const now = new Date(nowIso);
  const initial = createInitialSignalState(now);
  const { state } = applyEventsIncrementally(initial, events, { now });
  const signals = computeSignalsFromState(state, { now });
  const scoring = computeScores({ signals, state, now });
  return {
    now,
    state,
    signals,
    scores: scoring.scores,
  };
}

function toSignalRows(signals) {
  return signals.map((item) => ({
    signal_key: item.signal_key,
    value: item.value,
    status: item.status,
    threshold_warn: item.threshold_warn,
    threshold_critical: item.threshold_critical,
    details: item.details,
    evidence_refs: item.evidence_refs,
    computed_at: new Date().toISOString(),
  }));
}

function toScoreRows(scores) {
  return scores.map((item) => ({
    score_type: item.score_type,
    score: item.score,
    level: item.level,
    factors: item.factors,
    evidence_refs: item.evidence_refs,
    computed_at: new Date().toISOString(),
  }));
}

test("1) client silent 4 days + approval -> client risk up + follow-up recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    ev(
      1,
      "stage_started",
      "2026-02-13T09:00:00.000Z",
      { stage_name: "Approval", approval_pending: true, due_at: "2026-02-15T00:00:00.000Z" },
      [ref({ doc_url: "https://docs.example.com/approval-checklist" })]
    ),
    ev(2, "message_sent", "2026-02-13T10:00:00.000Z", { sender: "team" }, [ref({ message_id: "cw-msg-1" })]),
  ];
  const pipeline = buildPipeline(events, now);
  const forecasts = computeRiskForecastsFromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    similarCases: [],
    now: new Date(now),
  });
  const clientForecast = forecasts.find((item) => item.risk_type === "client_risk");
  assert.ok(clientForecast.probability_7d >= 0.45);

  const recs = await generateRecommendationsV2FromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    forecasts,
    similarCases: [],
    now: new Date(now),
    context: { client_name: "ACME", stage_name: "Approval", project_name: "Studio Redesign" },
  });
  const followUp = recs.find((row) => row.category === "waiting_on_client");
  assert.ok(followUp);
  assert.ok(followUp.evidence_refs.length > 0);
  assert.match(followUp.suggested_template, /апрув|подтверд/i);
});

test("2) two out-of-scope requests in week -> scope risk up + CR recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    ev(1, "message_sent", "2026-02-12T09:00:00.000Z", { sender: "client" }, [ref({ message_id: "m1" })]),
    ev(2, "scope_change_requested", "2026-02-13T10:00:00.000Z", {}, [ref({ message_id: "m2" })]),
    ev(3, "scope_change_requested", "2026-02-16T10:00:00.000Z", {}, [ref({ message_id: "m3" })]),
  ];
  const pipeline = buildPipeline(events, now);
  const forecasts = computeRiskForecastsFromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    similarCases: [],
    now: new Date(now),
  });
  const scopeForecast = forecasts.find((item) => item.risk_type === "scope_risk");
  assert.ok(scopeForecast.probability_14d >= 0.4);

  const recs = await generateRecommendationsV2FromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    forecasts,
    now: new Date(now),
    context: { client_name: "ACME" },
  });
  const cr = recs.find((row) => row.category === "scope_creep_change_request");
  assert.ok(cr);
  assert.ok(cr.evidence_refs.length > 0);
});

test("3) blockers >3 and older 5 days -> delivery risk up + escalate/replan recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    ev(1, "task_blocked", "2026-02-10T09:00:00.000Z", { blocker_id: "b1" }, [ref({ linear_issue_id: "LIN-1" })]),
    ev(2, "task_blocked", "2026-02-10T10:00:00.000Z", { blocker_id: "b2" }, [ref({ linear_issue_id: "LIN-2" })]),
    ev(3, "task_blocked", "2026-02-10T11:00:00.000Z", { blocker_id: "b3" }, [ref({ linear_issue_id: "LIN-3" })]),
    ev(4, "task_blocked", "2026-02-10T12:00:00.000Z", { blocker_id: "b4" }, [ref({ linear_issue_id: "LIN-4" })]),
  ];
  const pipeline = buildPipeline(events, now);
  const forecasts = computeRiskForecastsFromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    similarCases: [],
    now: new Date(now),
  });
  const delivery = forecasts.find((item) => item.risk_type === "delivery_risk");
  assert.ok(delivery.probability_7d >= 0.45);

  const recs = await generateRecommendationsV2FromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    forecasts,
    now: new Date(now),
    context: { project_name: "Studio PM" },
  });
  const rec = recs.find((row) => row.category === "delivery_risk");
  assert.ok(rec);
  assert.ok(rec.evidence_refs.length > 0);
});

test("4) burn rate > 20% plan -> finance risk up + recalc/renegotiate recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    ev(1, "finance_entry_created", "2026-02-10T10:00:00.000Z", { entry_type: "planned_budget", amount: 10000 }, [ref({ attio_record_id: "deal-1" })]),
    ev(2, "finance_entry_created", "2026-02-15T10:00:00.000Z", { entry_type: "cost", amount: 12500 }, [ref({ attio_record_id: "deal-1" })]),
  ];
  const pipeline = buildPipeline(events, now);
  const forecasts = computeRiskForecastsFromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    similarCases: [],
    now: new Date(now),
  });
  const finance = forecasts.find((item) => item.risk_type === "finance_risk");
  assert.ok(finance.probability_7d >= 0.45);

  const recs = await generateRecommendationsV2FromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    forecasts,
    now: new Date(now),
    context: { client_name: "ACME" },
  });
  const rec = recs.find((row) => row.category === "finance_risk");
  assert.ok(rec);
  assert.ok(rec.evidence_refs.length > 0);
});

test("5) deal stage freeze -> client risk up + winback recommendation", async () => {
  const now = "2026-02-17T12:00:00.000Z";
  const events = [
    ev(1, "message_sent", "2026-02-12T10:00:00.000Z", { sender: "team" }, [ref({ message_id: "m-team-10" })]),
    ev(2, "message_sent", "2026-02-16T10:00:00.000Z", { sender: "client", sentiment_score: -0.5 }, [ref({ message_id: "m-client-10" })]),
  ];
  const pipeline = buildPipeline(events, now);
  const similarCases = [
    {
      case_project_id: "p-sim-1",
      similarity_score: 0.82,
      why_similar: "sequence overlap",
      outcomes_seen: [{ outcome_type: "client_risk", severity: 5, evidence_refs: [ref({ attio_record_id: "deal-frozen-1" })] }],
    },
    {
      case_project_id: "p-sim-2",
      similarity_score: 0.77,
      why_similar: "scope+waiting",
      outcomes_seen: [{ outcome_type: "client_risk", severity: 4, evidence_refs: [ref({ attio_record_id: "deal-frozen-2" })] }],
    },
  ];
  const forecasts = computeRiskForecastsFromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    similarCases,
    now: new Date(now),
  });
  const client = forecasts.find((item) => item.risk_type === "client_risk");
  assert.ok(client.probability_14d >= 0.65);

  const recs = await generateRecommendationsV2FromInputs({
    signals: pipeline.signals,
    scores: pipeline.scores,
    forecasts,
    similarCases,
    now: new Date(now),
    context: { client_name: "ACME" },
  });
  const winback = recs.find((row) => row.category === "winback");
  assert.ok(winback);
  assert.ok(winback.evidence_refs.length > 0);
});

test("6) find top-3 similar cases and explain patterns/outcomes", () => {
  const sourceSignature = {
    signature_vector: [0.4, 0.6, 0.5, 0.3],
    features_json: { event_ngrams: ["message_sent>scope_change_detected", "issue_blocked>issue_blocked"] },
    context_json: { project_type: "delivery", budget_bucket: "md", stage_bucket: "proposal" },
  };
  const candidates = [
    {
      project_id: "case-a",
      project_name: "Case A",
      signature_vector: [0.42, 0.58, 0.48, 0.35],
      features_json: { event_ngrams: ["message_sent>scope_change_detected", "issue_blocked>issue_blocked"] },
      context_json: { project_type: "delivery", budget_bucket: "md", stage_bucket: "proposal" },
      outcomes_seen: [{ outcome_type: "delivery_risk", severity: 4 }],
    },
    {
      project_id: "case-b",
      project_name: "Case B",
      signature_vector: [0.3, 0.65, 0.55, 0.4],
      features_json: { event_ngrams: ["message_sent>scope_change_detected"] },
      context_json: { project_type: "delivery", budget_bucket: "md", stage_bucket: "negotiation" },
      outcomes_seen: [{ outcome_type: "scope_risk", severity: 5 }],
    },
    {
      project_id: "case-c",
      project_name: "Case C",
      signature_vector: [0.1, 0.2, 0.2, 0.1],
      features_json: { event_ngrams: ["message_sent>message_sent"] },
      context_json: { project_type: "support", budget_bucket: "xs", stage_bucket: "discovery" },
      outcomes_seen: [{ outcome_type: "client_risk", severity: 3 }],
    },
    {
      project_id: "case-d",
      project_name: "Case D",
      signature_vector: [0.44, 0.57, 0.51, 0.33],
      features_json: { event_ngrams: ["issue_blocked>issue_blocked", "issue_blocked>issue_unblocked"] },
      context_json: { project_type: "delivery", budget_bucket: "md", stage_bucket: "proposal" },
      outcomes_seen: [{ outcome_type: "delivery_risk", severity: 5 }],
    },
  ];
  const top = rankSimilarCasesFromSignatures(sourceSignature, candidates, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].similarity_score >= top[1].similarity_score);
  assert.ok(top[0].why_similar.includes("time_series"));
  assert.ok(Array.isArray(top[0].outcomes_seen));
});

test("7) forecast horizon 14/30 remains stable and deterministic", () => {
  const signals = [
    { signal_key: "blockers_age", value: 4, evidence_refs: [ref({ linear_issue_id: "L-1" })] },
    { signal_key: "stage_overdue", value: 2, evidence_refs: [ref({ linear_issue_id: "L-2" })] },
    { signal_key: "scope_creep_rate", value: 0.25, evidence_refs: [ref({ message_id: "m-1" })] },
    { signal_key: "budget_burn_rate", value: 1.15, evidence_refs: [ref({ attio_record_id: "d-1" })] },
    { signal_key: "margin_risk", value: 0.3, evidence_refs: [ref({ attio_record_id: "d-2" })] },
    { signal_key: "waiting_on_client_days", value: 3, evidence_refs: [ref({ message_id: "m-2" })] },
    { signal_key: "response_time_avg", value: 300, evidence_refs: [ref({ message_id: "m-3" })] },
    { signal_key: "activity_drop", value: 0.35, evidence_refs: [ref({ message_id: "m-4" })] },
    { signal_key: "sentiment_trend", value: -0.2, evidence_refs: [ref({ message_id: "m-5" })] },
  ];
  const scores = [{ score_type: "risk", score: 68 }];
  const similarCases = [{ case_project_id: "p1", similarity_score: 0.8, outcomes_seen: [{ outcome_type: "delivery_risk", severity: 4 }] }];

  const a = computeRiskForecastsFromInputs({ signals, scores, similarCases, now: new Date("2026-02-17T00:00:00.000Z") });
  const b = computeRiskForecastsFromInputs({ signals, scores, similarCases, now: new Date("2026-02-17T00:00:00.000Z") });
  assert.deepEqual(a, b);
  for (const row of a) {
    assert.ok(row.probability_7d <= row.probability_14d + 1e-9);
    assert.ok(row.probability_14d <= row.probability_30d + 1e-9);
  }
});

test("8) incremental chatwoot messages update signals and snapshot payload", () => {
  const now = new Date("2026-02-17T12:00:00.000Z");
  const initial = createInitialSignalState(now);
  const step1 = applyEventsIncrementally(
    initial,
    [ev(1, "message_sent", "2026-02-17T08:00:00.000Z", { sender: "client" }, [ref({ message_id: "msg-a" })])],
    { now }
  );
  const signals1 = computeSignalsFromState(step1.state, { now });
  const scores1 = computeScores({ signals: signals1, state: step1.state, now }).scores;
  const snapshot1 = composeSnapshotPayloadFromRows(toSignalRows(signals1), toScoreRows(scores1), { events: { events_7d: 1 } });

  const step2 = applyEventsIncrementally(
    step1.state,
    [ev(2, "message_sent", "2026-02-17T10:00:00.000Z", { sender: "team" }, [ref({ message_id: "msg-b" })])],
    { now }
  );
  const signals2 = computeSignalsFromState(step2.state, { now });
  const scores2 = computeScores({ signals: signals2, state: step2.state, now }).scores;
  const snapshot2 = composeSnapshotPayloadFromRows(toSignalRows(signals2), toScoreRows(scores2), { events: { events_7d: 2 } });

  assert.notDeepEqual(snapshot1.normalized_signals_json, snapshot2.normalized_signals_json);
  assert.ok(snapshot2.signals_json.response_time_avg.value > 0);
});

test("9) attio contact email creates traceable loops payload (no send)", () => {
  const payload = buildLoopsDraftPayloadFromAttioContact({
    external_id: "attio-person-123",
    account_external_id: "attio-company-456",
    full_name: "Jane Doe",
    email: "jane@acme.com",
    role: "buyer",
  });
  assert.ok(payload);
  assert.equal(payload.email, "jane@acme.com");
  assert.equal(payload.send, false);
  assert.equal(payload.source_refs[0].attio_record_id, "attio-person-123");
});

test("10) feature flags off -> KAG pipeline does not break existing API path", async () => {
  const previous = process.env.KAG_ENABLED;
  process.env.KAG_ENABLED = "0";
  const result = await runKagRecommendationRefresh(
    null,
    { projectId: "project-1", accountScopeId: "scope-1" },
    { now: new Date("2026-02-17T00:00:00.000Z") }
  );
  assert.equal(result.enabled, false);
  assert.equal(result.skipped, "kag_disabled");
  process.env.KAG_ENABLED = previous;
});

test("11) evidence gating marks snapshot payload unpublished without references", () => {
  const snapshot = composeSnapshotPayloadFromRows(
    [
      {
        signal_key: "waiting_on_client_days",
        value: 4,
        status: "critical",
        threshold_warn: 2,
        threshold_critical: 4,
        details: {},
        evidence_refs: [],
        computed_at: new Date().toISOString(),
      },
    ],
    [
      {
        score_type: "risk",
        score: 80,
        level: "high",
        factors: [],
        evidence_refs: [],
        computed_at: new Date().toISOString(),
      },
    ],
    { events: { events_7d: 0 } }
  );
  assert.equal(snapshot.publishable, false);
  assert.equal(snapshot.evidence_refs.length, 0);
});

test("12) forecast output marks rows publishable only with evidence", () => {
  const forecastsNoEvidence = computeRiskForecastsFromInputs({
    signals: [
      { signal_key: "waiting_on_client_days", value: 5, evidence_refs: [] },
      { signal_key: "stage_overdue", value: 4, evidence_refs: [] },
      { signal_key: "blockers_age", value: 6, evidence_refs: [] },
      { signal_key: "scope_creep_rate", value: 0.4, evidence_refs: [] },
      { signal_key: "budget_burn_rate", value: 1.3, evidence_refs: [] },
      { signal_key: "margin_risk", value: 0.5, evidence_refs: [] },
      { signal_key: "sentiment_trend", value: -0.3, evidence_refs: [] },
      { signal_key: "activity_drop", value: 0.6, evidence_refs: [] },
      { signal_key: "response_time_avg", value: 500, evidence_refs: [] },
    ],
    scores: [{ score_type: "risk", score: 85 }],
    similarCases: [],
    now: new Date("2026-02-17T00:00:00.000Z"),
  });
  assert.ok(forecastsNoEvidence.every((row) => row.publishable === false));

  const forecastsWithEvidence = computeRiskForecastsFromInputs({
    signals: [
      { signal_key: "waiting_on_client_days", value: 5, evidence_refs: [ref({ message_id: "m1" })] },
      { signal_key: "stage_overdue", value: 4, evidence_refs: [ref({ linear_issue_id: "L-1" })] },
      { signal_key: "blockers_age", value: 6, details: { open_blockers: 4 }, evidence_refs: [ref({ linear_issue_id: "L-2" })] },
      { signal_key: "scope_creep_rate", value: 0.4, evidence_refs: [ref({ message_id: "m2" })] },
      { signal_key: "budget_burn_rate", value: 1.3, evidence_refs: [ref({ attio_record_id: "D-1" })] },
      { signal_key: "margin_risk", value: 0.5, evidence_refs: [ref({ attio_record_id: "D-2" })] },
      { signal_key: "sentiment_trend", value: -0.3, evidence_refs: [ref({ message_id: "m3" })] },
      { signal_key: "activity_drop", value: 0.6, evidence_refs: [ref({ message_id: "m4" })] },
      { signal_key: "response_time_avg", value: 500, evidence_refs: [ref({ message_id: "m5" })] },
    ],
    scores: [{ score_type: "risk", score: 85 }],
    similarCases: [],
    now: new Date("2026-02-17T00:00:00.000Z"),
  });
  assert.ok(forecastsWithEvidence.every((row) => row.publishable === true));
});
