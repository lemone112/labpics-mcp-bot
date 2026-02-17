/**
 * Shared test helpers for KAG unit tests.
 * Re-usable event/evidence builders + pipeline runner.
 */
import {
  applyEventsIncrementally,
  computeSignalsFromState,
  createInitialSignalState,
  mapSignalsByKey,
} from "../src/kag/signals/index.js";
import { computeScores } from "../src/kag/scoring/index.js";
import { generateRecommendations } from "../src/kag/recommendations/index.js";

/** Build a minimal KAG event fixture. */
export function event(id, eventType, eventTs, payload = {}, evidenceRefs = []) {
  return {
    id,
    event_type: eventType,
    event_ts: eventTs,
    payload,
    evidence_refs: evidenceRefs,
  };
}

/** Build an evidence-ref fixture with optional overrides. */
export function evidence(overrides = {}) {
  return {
    message_id: overrides.message_id || null,
    linear_issue_id: overrides.linear_issue_id || null,
    attio_record_id: overrides.attio_record_id || null,
    doc_url: overrides.doc_url || null,
    rag_chunk_id: overrides.rag_chunk_id || null,
  };
}

/** Run signals → scoring → recommendations in one call. */
export async function runPipeline(events, nowIso) {
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
  const sm = {};
  for (const s of scoring.scores) sm[s.score_type] = s;
  return {
    now,
    state,
    signals,
    signalMap: mapSignalsByKey(signals),
    scores: scoring.scores,
    scoreMap: sm,
    recommendations,
  };
}
