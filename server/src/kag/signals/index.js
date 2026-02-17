import { clamp, toNumber, toDate, toIso } from '../../lib/utils.js';

export const SIGNAL_KEYS = Object.freeze({
  WAITING_ON_CLIENT_DAYS: "waiting_on_client_days",
  RESPONSE_TIME_AVG: "response_time_avg",
  BLOCKERS_AGE: "blockers_age",
  STAGE_OVERDUE: "stage_overdue",
  AGREEMENT_OVERDUE_COUNT: "agreement_overdue_count",
  SENTIMENT_TREND: "sentiment_trend",
  SCOPE_CREEP_RATE: "scope_creep_rate",
  BUDGET_BURN_RATE: "budget_burn_rate",
  MARGIN_RISK: "margin_risk",
  ACTIVITY_DROP: "activity_drop",
});

const SIGNAL_DEFINITIONS = Object.freeze({
  [SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS]: {
    warn: 2,
    critical: 4,
    comparator: "high",
  },
  [SIGNAL_KEYS.RESPONSE_TIME_AVG]: {
    warn: 240,
    critical: 720,
    comparator: "high",
  },
  [SIGNAL_KEYS.BLOCKERS_AGE]: {
    warn: 3,
    critical: 5,
    comparator: "high",
  },
  [SIGNAL_KEYS.STAGE_OVERDUE]: {
    warn: 1,
    critical: 3,
    comparator: "high",
  },
  [SIGNAL_KEYS.AGREEMENT_OVERDUE_COUNT]: {
    warn: 1,
    critical: 2,
    comparator: "high",
  },
  [SIGNAL_KEYS.SENTIMENT_TREND]: {
    warn: -0.15,
    critical: -0.3,
    comparator: "negative",
  },
  [SIGNAL_KEYS.SCOPE_CREEP_RATE]: {
    warn: 0.2,
    critical: 0.35,
    comparator: "high",
  },
  [SIGNAL_KEYS.BUDGET_BURN_RATE]: {
    warn: 1.1,
    critical: 1.2,
    comparator: "high",
  },
  [SIGNAL_KEYS.MARGIN_RISK]: {
    warn: 0.25,
    critical: 0.4,
    comparator: "high",
  },
  [SIGNAL_KEYS.ACTIVITY_DROP]: {
    warn: 0.3,
    critical: 0.5,
    comparator: "high",
  },
});

function dayKey(date) {
  const d = toDate(date, new Date());
  return d.toISOString().slice(0, 10);
}

function diffMinutes(later, earlier) {
  const left = toDate(later);
  const right = toDate(earlier);
  if (!left || !right) return 0;
  return Math.max(0, (left.getTime() - right.getTime()) / 60000);
}

function diffDays(later, earlier) {
  return diffMinutes(later, earlier) / 60 / 24;
}

function parseEvidenceRef(item) {
  if (!item || typeof item !== "object") return null;
  const out = {
    message_id: item.message_id ? String(item.message_id) : null,
    linear_issue_id: item.linear_issue_id ? String(item.linear_issue_id) : null,
    attio_record_id: item.attio_record_id ? String(item.attio_record_id) : null,
    doc_url: item.doc_url ? String(item.doc_url) : null,
    rag_chunk_id: item.rag_chunk_id ? String(item.rag_chunk_id) : null,
    source_table: item.source_table ? String(item.source_table) : null,
    source_pk: item.source_pk ? String(item.source_pk) : null,
  };
  if (!out.message_id && !out.linear_issue_id && !out.attio_record_id && !out.doc_url && !out.rag_chunk_id) {
    return null;
  }
  return out;
}

function evidenceKey(ref) {
  return [
    ref.message_id || "",
    ref.linear_issue_id || "",
    ref.attio_record_id || "",
    ref.doc_url || "",
    ref.rag_chunk_id || "",
    ref.source_table || "",
    ref.source_pk || "",
  ].join("|");
}

function dedupeEvidenceRefs(refs = [], limit = 30) {
  const seen = new Set();
  const out = [];
  for (const ref of refs) {
    const normalized = parseEvidenceRef(ref);
    if (!normalized) continue;
    const key = evidenceKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function mergeEvidence(existing = [], incoming = [], limit = 30) {
  return dedupeEvidenceRefs([...(existing || []), ...(incoming || [])], limit);
}

function ensureEvidenceBucket(state, signalKey) {
  if (!state.evidence_by_signal[signalKey]) {
    state.evidence_by_signal[signalKey] = [];
  }
  return state.evidence_by_signal[signalKey];
}

function attachEvidence(state, signalKeys, refs = []) {
  const normalized = dedupeEvidenceRefs(refs, 20);
  if (!normalized.length) return;
  for (const signalKey of signalKeys) {
    const bucket = ensureEvidenceBucket(state, signalKey);
    bucket.push(...normalized);
    state.evidence_by_signal[signalKey] = dedupeEvidenceRefs(bucket, 20);
  }
}

function incrementActivity(state, occurredAt) {
  const key = dayKey(occurredAt);
  const current = Number(state.activity.daily_counts[key] || 0);
  state.activity.daily_counts[key] = current + 1;
}

function pushTimestamp(arrayRef, occurredAt, maxItems = 400) {
  const d = toDate(occurredAt);
  if (!d) return;
  arrayRef.push(d.toISOString());
  if (arrayRef.length > maxItems) {
    arrayRef.splice(0, arrayRef.length - maxItems);
  }
}

function pruneTimestampArray(arrayRef, now, keepDays = 35) {
  const cutoff = new Date(toDate(now, new Date()).getTime() - keepDays * 24 * 60 * 60 * 1000);
  let writeIdx = 0;
  for (const item of arrayRef) {
    const ts = toDate(item);
    if (!ts || ts < cutoff) continue;
    arrayRef[writeIdx++] = ts.toISOString();
  }
  arrayRef.length = writeIdx;
}

function pruneActivity(state, now, keepDays = 30) {
  const cutoff = new Date(toDate(now, new Date()).getTime() - keepDays * 24 * 60 * 60 * 1000);
  for (const key of Object.keys(state.activity.daily_counts)) {
    const ts = toDate(`${key}T00:00:00.000Z`);
    if (!ts || ts < cutoff) {
      delete state.activity.daily_counts[key];
    }
  }
}

function trimOpenMapByAge(mapRef, now, keepDays = 90, dateField = "opened_at") {
  const cutoff = new Date(toDate(now, new Date()).getTime() - keepDays * 24 * 60 * 60 * 1000);
  for (const [id, item] of Object.entries(mapRef)) {
    const ts = toDate(item?.[dateField] || item?.created_at || item?.updated_at);
    if (!ts || ts < cutoff) {
      delete mapRef[id];
    }
  }
}

function rateStatus(signalKey, value) {
  const def = SIGNAL_DEFINITIONS[signalKey];
  if (!def) return "ok";
  if (def.comparator === "negative") {
    if (value <= def.critical) return "critical";
    if (value <= def.warn) return "warn";
    return "ok";
  }
  if (value >= def.critical) return "critical";
  if (value >= def.warn) return "warn";
  return "ok";
}

export function createInitialSignalState(now = new Date()) {
  return {
    version: 1,
    waiting: {
      last_client_message_at: null,
      last_team_message_at: null,
    },
    response: {
      pending_client_messages: [],
      total_minutes: 0,
      samples: 0,
    },
    blockers: {
      open: {},
    },
    stage: {
      stage_id: null,
      stage_name: null,
      status: "unknown",
      started_at: null,
      due_at: null,
      approval_pending: false,
    },
    agreements: {
      open: {},
    },
    sentiment: {
      ewma: 0,
      prev_ewma: 0,
      samples: 0,
      alpha: 0.35,
    },
    scope: {
      requests: [],
      client_requests: [],
    },
    finance: {
      planned_budget: 0,
      actual_cost: 0,
      revenue: 0,
    },
    activity: {
      daily_counts: {},
    },
    needs: {
      events: [],
      evidence: [],
    },
    evidence_by_signal: {},
    cursor: {
      last_event_id: 0,
      last_event_ts: toIso(now),
    },
  };
}

function applyMessageEvent(state, event, occurredAt, evidenceRefs) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const sender = String(payload.sender || payload.sender_type || "").trim().toLowerCase();
  const sentimentScore = Number(payload.sentiment_score);

  if (sender === "client") {
    state.waiting.last_client_message_at = occurredAt.toISOString();
    pushTimestamp(state.response.pending_client_messages, occurredAt);
    pushTimestamp(state.scope.client_requests, occurredAt);
    attachEvidence(state, [SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, SIGNAL_KEYS.RESPONSE_TIME_AVG], evidenceRefs);
  }

  if (sender === "team" || sender === "agent" || sender === "pm") {
    state.waiting.last_team_message_at = occurredAt.toISOString();
    const pending = state.response.pending_client_messages;
    if (pending.length) {
      const oldestPending = toDate(pending[0]);
      if (oldestPending) {
        const responseMinutes = diffMinutes(occurredAt, oldestPending);
        state.response.total_minutes += responseMinutes;
        state.response.samples += 1;
      }
      pending.shift();
      attachEvidence(state, [SIGNAL_KEYS.RESPONSE_TIME_AVG], evidenceRefs);
    }
    attachEvidence(state, [SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS], evidenceRefs);
  }

  if (Number.isFinite(sentimentScore)) {
    const bounded = clamp(sentimentScore, -1, 1);
    const alpha = clamp(state.sentiment.alpha || 0.35, 0.05, 0.9);
    state.sentiment.prev_ewma = state.sentiment.ewma;
    if (state.sentiment.samples === 0) {
      state.sentiment.ewma = bounded;
    } else {
      state.sentiment.ewma = alpha * bounded + (1 - alpha) * state.sentiment.ewma;
    }
    state.sentiment.samples += 1;
    attachEvidence(state, [SIGNAL_KEYS.SENTIMENT_TREND], evidenceRefs);
  }

  incrementActivity(state, occurredAt);
  attachEvidence(state, [SIGNAL_KEYS.ACTIVITY_DROP], evidenceRefs);
}

function applyBlockerEvent(state, event, occurredAt, evidenceRefs) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const blockerId = String(payload.blocker_id || payload.task_id || event.subject_node_id || "").trim();
  if (!blockerId) return;
  if (event.event_type === "task_blocked") {
    if (!state.blockers.open[blockerId]) {
      state.blockers.open[blockerId] = {
        opened_at: occurredAt.toISOString(),
      };
    }
    attachEvidence(state, [SIGNAL_KEYS.BLOCKERS_AGE], evidenceRefs);
    incrementActivity(state, occurredAt);
    return;
  }
  if (event.event_type === "blocker_resolved") {
    delete state.blockers.open[blockerId];
    attachEvidence(state, [SIGNAL_KEYS.BLOCKERS_AGE], evidenceRefs);
    incrementActivity(state, occurredAt);
  }
}

function applyStageEvent(state, event, occurredAt, evidenceRefs) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (event.event_type === "stage_started") {
    state.stage.stage_id = String(payload.stage_id || event.subject_node_id || state.stage.stage_id || "").trim() || null;
    state.stage.stage_name = String(payload.stage_name || state.stage.stage_name || "").trim() || null;
    state.stage.status = "active";
    state.stage.started_at = occurredAt.toISOString();
    state.stage.due_at = toIso(payload.due_at);
    state.stage.approval_pending = Boolean(payload.approval_pending || payload.requires_approval || false);
    attachEvidence(state, [SIGNAL_KEYS.STAGE_OVERDUE], evidenceRefs);
    incrementActivity(state, occurredAt);
    return;
  }
  if (event.event_type === "stage_completed") {
    state.stage.status = "completed";
    state.stage.approval_pending = false;
    attachEvidence(state, [SIGNAL_KEYS.STAGE_OVERDUE], evidenceRefs);
    incrementActivity(state, occurredAt);
  }
}

function applyAgreementEvent(state, event, occurredAt, evidenceRefs) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (event.event_type === "agreement_created") {
    const agreementId = String(payload.agreement_id || event.subject_node_id || "").trim();
    if (!agreementId) return;
    state.agreements.open[agreementId] = {
      due_at: toIso(payload.due_at),
      created_at: occurredAt.toISOString(),
    };
    attachEvidence(state, [SIGNAL_KEYS.AGREEMENT_OVERDUE_COUNT], evidenceRefs);
    incrementActivity(state, occurredAt);
    return;
  }
  if (event.event_type === "approval_approved") {
    const agreementId = String(payload.agreement_id || event.subject_node_id || "").trim();
    if (agreementId) delete state.agreements.open[agreementId];
    state.stage.approval_pending = false;
    attachEvidence(state, [SIGNAL_KEYS.AGREEMENT_OVERDUE_COUNT], evidenceRefs);
    incrementActivity(state, occurredAt);
  }
}

function applyScopeEvent(state, occurredAt, evidenceRefs) {
  pushTimestamp(state.scope.requests, occurredAt);
  attachEvidence(state, [SIGNAL_KEYS.SCOPE_CREEP_RATE], evidenceRefs);
  incrementActivity(state, occurredAt);
}

function applyFinanceEvent(state, event, occurredAt, evidenceRefs) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const entryType = String(payload.entry_type || payload.kind || "").trim().toLowerCase();
  const amount = Math.abs(toNumber(payload.amount, 0));

  if (entryType === "planned_budget" || entryType === "budget_plan" || entryType === "budget") {
    state.finance.planned_budget += amount;
  } else if (entryType === "cost" || entryType === "expense") {
    state.finance.actual_cost += amount;
  } else if (entryType === "revenue" || entryType === "invoice" || entryType === "payment") {
    state.finance.revenue += amount;
  }

  attachEvidence(state, [SIGNAL_KEYS.BUDGET_BURN_RATE, SIGNAL_KEYS.MARGIN_RISK], evidenceRefs);
  incrementActivity(state, occurredAt);
}

function applyNeedEvent(state, occurredAt, evidenceRefs) {
  pushTimestamp(state.needs.events, occurredAt);
  state.needs.evidence = mergeEvidence(state.needs.evidence, evidenceRefs, 20);
  incrementActivity(state, occurredAt);
  attachEvidence(state, [SIGNAL_KEYS.ACTIVITY_DROP], evidenceRefs);
}

function pruneState(state, now) {
  pruneTimestampArray(state.response.pending_client_messages, now, 35);
  pruneTimestampArray(state.scope.requests, now, 35);
  pruneTimestampArray(state.scope.client_requests, now, 35);
  pruneTimestampArray(state.needs.events, now, 35);
  pruneActivity(state, now, 30);
  trimOpenMapByAge(state.blockers.open, now, 90, "opened_at");
  trimOpenMapByAge(state.agreements.open, now, 90, "created_at");
}

export function applyEventToSignalState(currentState, event, options = {}) {
  const state = currentState || createInitialSignalState(options.now);
  const occurredAt = toDate(event?.event_ts || event?.occurred_at || event?.created_at, new Date());
  const evidenceRefs = dedupeEvidenceRefs(event?.evidence_refs || event?.evidence || [], 15);
  const eventType = String(event?.event_type || "").trim().toLowerCase();

  if (!eventType) return state;

  if (eventType === "message_sent") {
    applyMessageEvent(state, event, occurredAt, evidenceRefs);
  } else if (eventType === "task_blocked" || eventType === "blocker_resolved") {
    applyBlockerEvent(state, event, occurredAt, evidenceRefs);
  } else if (eventType === "stage_started" || eventType === "stage_completed") {
    applyStageEvent(state, event, occurredAt, evidenceRefs);
  } else if (eventType === "agreement_created" || eventType === "approval_approved") {
    applyAgreementEvent(state, event, occurredAt, evidenceRefs);
  } else if (eventType === "scope_change_requested") {
    applyScopeEvent(state, occurredAt, evidenceRefs);
  } else if (eventType === "finance_entry_created") {
    applyFinanceEvent(state, event, occurredAt, evidenceRefs);
  } else if (eventType === "need_detected") {
    applyNeedEvent(state, occurredAt, evidenceRefs);
  } else if (eventType === "decision_made" || eventType === "offer_created" || eventType === "task_created") {
    incrementActivity(state, occurredAt);
    attachEvidence(state, [SIGNAL_KEYS.ACTIVITY_DROP], evidenceRefs);
  }

  const lastEventId = Number.parseInt(String(event?.id || event?.event_id || 0), 10);
  if (Number.isFinite(lastEventId) && lastEventId > Number(state.cursor.last_event_id || 0)) {
    state.cursor.last_event_id = lastEventId;
  }
  state.cursor.last_event_ts = occurredAt.toISOString();
  pruneState(state, options.now || occurredAt);
  return state;
}

export function applyEventsIncrementally(previousState, events = [], options = {}) {
  const state = previousState ? structuredClone(previousState) : createInitialSignalState(options.now);
  const sorted = [...events].sort((a, b) => {
    const leftId = Number.parseInt(String(a?.id || a?.event_id || 0), 10);
    const rightId = Number.parseInt(String(b?.id || b?.event_id || 0), 10);
    if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
      return leftId - rightId;
    }
    const leftTs = toDate(a?.event_ts || a?.occurred_at || a?.created_at, new Date(0));
    const rightTs = toDate(b?.event_ts || b?.occurred_at || b?.created_at, new Date(0));
    return leftTs.getTime() - rightTs.getTime();
  });

  for (const event of sorted) {
    applyEventToSignalState(state, event, options);
  }

  return {
    state,
    processed_events: sorted.length,
    last_event_id: Number(state.cursor.last_event_id || 0),
  };
}

function countInLastDays(isoTimestamps, now, days) {
  const cutoff = new Date(toDate(now, new Date()).getTime() - days * 24 * 60 * 60 * 1000);
  let count = 0;
  for (const item of isoTimestamps) {
    const ts = toDate(item);
    if (ts && ts >= cutoff) count += 1;
  }
  return count;
}

function sumActivityInRange(dailyCounts, fromOffsetDays, toOffsetDays, now) {
  const base = toDate(now, new Date());
  let total = 0;
  for (let offset = fromOffsetDays; offset <= toOffsetDays; offset += 1) {
    const d = new Date(base.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    total += Number(dailyCounts[key] || 0);
  }
  return total;
}

function buildSignal(state, signalKey, value, details = {}) {
  const definition = SIGNAL_DEFINITIONS[signalKey] || {};
  return {
    signal_key: signalKey,
    value: Number(value.toFixed(4)),
    status: rateStatus(signalKey, value),
    threshold_warn: definition.warn ?? null,
    threshold_critical: definition.critical ?? null,
    details,
    evidence_refs: dedupeEvidenceRefs(state.evidence_by_signal[signalKey] || [], 20),
  };
}

export function computeSignalsFromState(stateInput, options = {}) {
  const state = stateInput || createInitialSignalState(options.now);
  const now = toDate(options.now, new Date());

  const lastClientAt = toDate(state.waiting.last_client_message_at);
  const lastTeamAt = toDate(state.waiting.last_team_message_at);
  const waitingOnClient = Boolean(lastTeamAt && (!lastClientAt || lastTeamAt > lastClientAt));
  const waitingDays = waitingOnClient ? diffDays(now, lastTeamAt) : 0;

  const samples = Number(state.response.samples || 0);
  const totalMinutes = Number(state.response.total_minutes || 0);
  const avgResponseMinutes = samples > 0 ? totalMinutes / samples : 0;

  const openBlockers = Object.values(state.blockers.open || {});
  const blockerCount = openBlockers.length;
  const blockersAgeDays =
    blockerCount > 0
      ? openBlockers.reduce((acc, blocker) => acc + diffDays(now, blocker.opened_at), 0) / blockerCount
      : 0;

  const stageDueAt = toDate(state.stage.due_at);
  const stageActive = String(state.stage.status || "") === "active";
  const stageOverdueDays = stageActive && stageDueAt && now > stageDueAt ? diffDays(now, stageDueAt) : 0;

  const openAgreements = Object.values(state.agreements.open || {});
  const agreementOverdueCount = openAgreements.filter((agreement) => {
    const dueAt = toDate(agreement.due_at);
    return dueAt && dueAt < now;
  }).length;

  const sentimentTrend = Number(state.sentiment.ewma || 0) - Number(state.sentiment.prev_ewma || 0);

  const scopeRequests7d = countInLastDays(state.scope.requests || [], now, 7);
  const clientRequests7d = countInLastDays(state.scope.client_requests || [], now, 7);
  const scopeCreepRate = scopeRequests7d / Math.max(1, clientRequests7d);

  const plannedBudget = Number(state.finance.planned_budget || 0);
  const actualCost = Number(state.finance.actual_cost || 0);
  const revenue = Number(state.finance.revenue || 0);
  const budgetBurnRate = plannedBudget > 0 ? actualCost / plannedBudget : actualCost > 0 ? 1.5 : 0;

  let marginRisk = 0;
  if (revenue <= 0 && actualCost > 0) {
    marginRisk = 1;
  } else if (revenue > 0) {
    const margin = (revenue - actualCost) / revenue;
    marginRisk = clamp((0.35 - margin) / 0.35, 0, 1);
  }

  const activityCurrent7d = sumActivityInRange(state.activity.daily_counts || {}, 0, 6, now);
  const activityPrev7d = sumActivityInRange(state.activity.daily_counts || {}, 7, 13, now);
  const activityDrop = activityPrev7d > 0 ? clamp((activityPrev7d - activityCurrent7d) / activityPrev7d, 0, 1) : 0;

  return [
    buildSignal(state, SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS, waitingDays, {
      waiting_on_client: waitingOnClient,
      last_client_message_at: state.waiting.last_client_message_at,
      last_team_message_at: state.waiting.last_team_message_at,
      stage_name: state.stage.stage_name,
      approval_pending: Boolean(state.stage.approval_pending),
    }),
    buildSignal(state, SIGNAL_KEYS.RESPONSE_TIME_AVG, avgResponseMinutes, {
      samples,
      total_minutes: Number(totalMinutes.toFixed(2)),
    }),
    buildSignal(state, SIGNAL_KEYS.BLOCKERS_AGE, blockersAgeDays, {
      open_blockers: blockerCount,
    }),
    buildSignal(state, SIGNAL_KEYS.STAGE_OVERDUE, stageOverdueDays, {
      stage_id: state.stage.stage_id,
      stage_name: state.stage.stage_name,
      due_at: state.stage.due_at,
      stage_status: state.stage.status,
      approval_pending: Boolean(state.stage.approval_pending),
    }),
    buildSignal(state, SIGNAL_KEYS.AGREEMENT_OVERDUE_COUNT, agreementOverdueCount, {
      open_agreements: openAgreements.length,
    }),
    buildSignal(state, SIGNAL_KEYS.SENTIMENT_TREND, sentimentTrend, {
      ewma: Number((state.sentiment.ewma || 0).toFixed(4)),
      prev_ewma: Number((state.sentiment.prev_ewma || 0).toFixed(4)),
      samples: Number(state.sentiment.samples || 0),
    }),
    buildSignal(state, SIGNAL_KEYS.SCOPE_CREEP_RATE, scopeCreepRate, {
      scope_requests_7d: scopeRequests7d,
      client_requests_7d: clientRequests7d,
    }),
    buildSignal(state, SIGNAL_KEYS.BUDGET_BURN_RATE, budgetBurnRate, {
      planned_budget: Number(plannedBudget.toFixed(2)),
      actual_cost: Number(actualCost.toFixed(2)),
    }),
    buildSignal(state, SIGNAL_KEYS.MARGIN_RISK, marginRisk, {
      revenue: Number(revenue.toFixed(2)),
      actual_cost: Number(actualCost.toFixed(2)),
    }),
    buildSignal(state, SIGNAL_KEYS.ACTIVITY_DROP, activityDrop, {
      activity_current_7d: activityCurrent7d,
      activity_prev_7d: activityPrev7d,
    }),
  ];
}

export function mapSignalsByKey(signals = []) {
  const map = {};
  for (const signal of signals) {
    if (!signal?.signal_key) continue;
    map[signal.signal_key] = signal;
  }
  return map;
}

export function signalDefinition(signalKey) {
  return SIGNAL_DEFINITIONS[signalKey] || null;
}
