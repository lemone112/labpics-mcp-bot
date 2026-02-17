import crypto from "node:crypto";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toDate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function toSnapshotDate(value = new Date()) {
  const date = toDate(value, new Date());
  return date.toISOString().slice(0, 10);
}

function comparatorForSignal(signalKey) {
  if (signalKey === "sentiment_trend") return "negative";
  return "high";
}

function normalizeSignalRisk(signal) {
  const value = Number(signal?.value || 0);
  const status = String(signal?.status || "ok").toLowerCase();
  const warn = Number(signal?.threshold_warn);
  const critical = Number(signal?.threshold_critical);
  const comparator = comparatorForSignal(signal?.signal_key);

  if (Number.isFinite(warn) && Number.isFinite(critical) && warn !== critical) {
    if (comparator === "negative") {
      // lower value -> higher risk
      return clamp((warn - value) / (warn - critical), 0, 1);
    }
    return clamp(value / critical, 0, 1);
  }

  if (status === "critical") return 0.9;
  if (status === "warn") return 0.6;
  return 0.1;
}

function buildDedupeKey(projectId, outcomeType, occurredAt, notes) {
  return crypto.createHash("sha1").update(`${projectId}:${outcomeType}:${occurredAt}:${notes || ""}`).digest("hex");
}

function scoreByType(scores) {
  const map = {};
  for (const item of scores) {
    if (!item?.score_type) continue;
    map[item.score_type] = item;
  }
  return map;
}

function signalByKey(signals) {
  const map = {};
  for (const item of signals) {
    if (!item?.signal_key) continue;
    map[item.signal_key] = item;
  }
  return map;
}

function outcomeFromSignals(snapshotDate, signalMap, scoreMap) {
  const candidates = [];
  const occurredAt = `${snapshotDate}T23:59:59.000Z`;

  const deliveryPressure =
    Number(signalMap.blockers_age?.value || 0) > 5 ||
    Number(signalMap.stage_overdue?.value || 0) > 3 ||
    Number(scoreMap.risk?.score || 0) >= 75;
  if (deliveryPressure) {
    candidates.push({
      outcome_type: "delivery_risk",
      severity: Number(scoreMap.risk?.score || 0) >= 85 ? 5 : 4,
      notes: "Delivery pressure threshold exceeded in snapshot",
      occurred_at: occurredAt,
      evidence_refs: [...(signalMap.blockers_age?.evidence_refs || []), ...(signalMap.stage_overdue?.evidence_refs || [])],
    });
  }

  const financePressure =
    Number(signalMap.budget_burn_rate?.value || 0) >= 1.2 || Number(signalMap.margin_risk?.value || 0) >= 0.4;
  if (financePressure) {
    candidates.push({
      outcome_type: "finance_risk",
      severity: Number(signalMap.budget_burn_rate?.value || 0) >= 1.3 ? 5 : 4,
      notes: "Burn or margin risk crossed critical range",
      occurred_at: occurredAt,
      evidence_refs: [...(signalMap.budget_burn_rate?.evidence_refs || []), ...(signalMap.margin_risk?.evidence_refs || [])],
    });
  }

  const clientPressure =
    Number(signalMap.waiting_on_client_days?.value || 0) >= 4 ||
    Number(signalMap.sentiment_trend?.value || 0) <= -0.3 ||
    Number(scoreMap.project_health?.score || 100) <= 45;
  if (clientPressure) {
    candidates.push({
      outcome_type: "client_risk",
      severity: Number(signalMap.waiting_on_client_days?.value || 0) >= 6 ? 5 : 4,
      notes: "Client engagement/health indicators degraded",
      occurred_at: occurredAt,
      evidence_refs: [...(signalMap.waiting_on_client_days?.evidence_refs || []), ...(signalMap.sentiment_trend?.evidence_refs || [])],
    });
  }

  const scopePressure = Number(signalMap.scope_creep_rate?.value || 0) >= 0.35;
  if (scopePressure) {
    candidates.push({
      outcome_type: "scope_risk",
      severity: Number(signalMap.scope_creep_rate?.value || 0) >= 0.5 ? 5 : 4,
      notes: "Scope creep ratio exceeded threshold",
      occurred_at: occurredAt,
      evidence_refs: signalMap.scope_creep_rate?.evidence_refs || [],
    });
  }

  return candidates;
}

async function fetchSignalRows(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT
        signal_key,
        value,
        status,
        threshold_warn,
        threshold_critical,
        details,
        evidence_refs,
        computed_at
      FROM kag_signals
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchScoreRows(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT
        score_type,
        score,
        level,
        factors,
        evidence_refs,
        computed_at
      FROM kag_scores
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchKeyAggregates(pool, scope) {
  const [eventCounts, sourceCounts, workload, revenue] = await Promise.all([
    pool.query(
      `
        SELECT
          count(*) FILTER (WHERE occurred_at > now() - interval '7 days')::int AS events_7d,
          count(*) FILTER (WHERE occurred_at > now() - interval '14 days')::int AS events_14d,
          count(*) FILTER (WHERE occurred_at > now() - interval '30 days')::int AS events_30d
        FROM kag_event_log
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT source, count(*)::int AS count
        FROM kag_event_log
        WHERE project_id = $1
          AND account_scope_id = $2
          AND occurred_at > now() - interval '14 days'
        GROUP BY source
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          count(*) FILTER (WHERE completed_at IS NULL)::int AS open_issues,
          count(*) FILTER (WHERE blocked = true AND completed_at IS NULL)::int AS blocked_issues,
          count(*) FILTER (WHERE due_date IS NOT NULL AND due_date < current_date AND completed_at IS NULL)::int AS overdue_issues
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          COALESCE(sum(amount), 0)::numeric(14,2) AS pipeline_amount,
          count(*)::int AS opportunities
        FROM attio_opportunities_raw
        WHERE project_id = $1
          AND account_scope_id = $2
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const bySource = {};
  for (const row of sourceCounts.rows) {
    bySource[row.source] = Number(row.count || 0);
  }

  return {
    events: eventCounts.rows[0] || {},
    events_by_source_14d: bySource,
    workload: workload.rows[0] || {},
    revenue: revenue.rows[0] || {},
  };
}

async function upsertSnapshot(pool, scope, snapshotDate, signals, normalizedSignals, scores, keyAggregates) {
  await pool.query(
    `
      INSERT INTO project_snapshots(
        project_id,
        account_scope_id,
        snapshot_date,
        signals_json,
        normalized_signals_json,
        scores_json,
        key_aggregates_json,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
      ON CONFLICT (project_id, snapshot_date)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        signals_json = EXCLUDED.signals_json,
        normalized_signals_json = EXCLUDED.normalized_signals_json,
        scores_json = EXCLUDED.scores_json,
        key_aggregates_json = EXCLUDED.key_aggregates_json,
        created_at = now()
    `,
    [
      scope.projectId,
      scope.accountScopeId,
      snapshotDate,
      JSON.stringify(signals),
      JSON.stringify(normalizedSignals),
      JSON.stringify(scores),
      JSON.stringify(keyAggregates),
    ]
  );
}

async function upsertOutcomes(pool, scope, outcomes = []) {
  if (!outcomes.length) return 0;
  const payload = outcomes.map((item) => ({
    outcome_type: String(item.outcome_type || "").trim().toLowerCase(),
    occurred_at: item.occurred_at || new Date().toISOString(),
    severity: clamp(item.severity, 1, 5),
    notes: String(item.notes || "").trim().slice(0, 3000) || null,
    evidence_refs: Array.isArray(item.evidence_refs) ? item.evidence_refs : [],
    source_event_id: Number.isFinite(Number(item.source_event_id)) ? Number(item.source_event_id) : null,
    dedupe_key: item.dedupe_key,
  }));

  const result = await pool.query(
    `
      INSERT INTO past_case_outcomes(
        project_id,
        account_scope_id,
        outcome_type,
        occurred_at,
        severity,
        notes,
        evidence_refs,
        source_event_id,
        dedupe_key
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.outcome_type,
        x.occurred_at::timestamptz,
        x.severity,
        x.notes,
        x.evidence_refs,
        x.source_event_id,
        x.dedupe_key
      FROM jsonb_to_recordset($3::jsonb) AS x(
        outcome_type text,
        occurred_at text,
        severity int,
        notes text,
        evidence_refs jsonb,
        source_event_id bigint,
        dedupe_key text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        severity = EXCLUDED.severity,
        notes = EXCLUDED.notes,
        evidence_refs = EXCLUDED.evidence_refs,
        source_event_id = EXCLUDED.source_event_id
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );

  return result.rowCount || 0;
}

async function deriveDealStageOutcomes(pool, scope, snapshotDate) {
  const fromTs = `${snapshotDate}T00:00:00.000Z`;
  const toTs = `${snapshotDate}T23:59:59.999Z`;
  const { rows } = await pool.query(
    `
      SELECT id, occurred_at, source_ref, payload_json
      FROM kag_event_log
      WHERE project_id = $1
        AND account_scope_id = $2
        AND source = 'attio'
        AND event_type = 'deal_stage_changed'
        AND occurred_at >= $3::timestamptz
        AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT 500
    `,
    [scope.projectId, scope.accountScopeId, fromTs, toTs]
  );

  const outcomes = [];
  for (const row of rows) {
    const stage = String(row.payload_json?.stage || "").toLowerCase();
    if (stage.includes("lost") || stage.includes("churn") || stage.includes("frozen") || stage.includes("stalled")) {
      outcomes.push({
        outcome_type: "client_risk",
        occurred_at: row.occurred_at,
        severity: 4,
        notes: `Deal stage degraded to "${stage || "unknown"}"`,
        evidence_refs: [
          {
            attio_record_id: row.source_ref,
            source_table: "attio_opportunities_raw",
            source_pk: row.source_ref,
          },
        ],
        source_event_id: row.id,
        dedupe_key: buildDedupeKey(scope.projectId, "client_risk", row.occurred_at, row.source_ref),
      });
    }
  }
  return outcomes;
}

export function composeSnapshotPayloadFromRows(signalRows = [], scoreRows = [], keyAggregates = {}) {
  const signalsObject = {};
  const normalizedSignals = {};
  for (const row of signalRows) {
    signalsObject[row.signal_key] = {
      value: Number(row.value),
      status: row.status,
      threshold_warn: row.threshold_warn,
      threshold_critical: row.threshold_critical,
      details: row.details || {},
      evidence_refs: row.evidence_refs || [],
      computed_at: row.computed_at || null,
    };
    normalizedSignals[row.signal_key] = Number(normalizeSignalRisk(row).toFixed(4));
  }

  const scoresObject = {};
  for (const row of scoreRows) {
    scoresObject[row.score_type] = {
      score: Number(row.score),
      level: row.level,
      factors: row.factors || [],
      evidence_refs: row.evidence_refs || [],
      computed_at: row.computed_at || null,
    };
  }

  return {
    signals_json: signalsObject,
    normalized_signals_json: normalizedSignals,
    scores_json: scoresObject,
    key_aggregates_json: keyAggregates || {},
  };
}

export async function buildProjectSnapshot(pool, scope, options = {}) {
  const snapshotDate = toSnapshotDate(options.snapshot_date || new Date());
  const [signalRows, scoreRows, aggregates] = await Promise.all([
    fetchSignalRows(pool, scope),
    fetchScoreRows(pool, scope),
    fetchKeyAggregates(pool, scope),
  ]);

  const snapshotPayload = composeSnapshotPayloadFromRows(signalRows, scoreRows, aggregates);
  await upsertSnapshot(
    pool,
    scope,
    snapshotDate,
    snapshotPayload.signals_json,
    snapshotPayload.normalized_signals_json,
    snapshotPayload.scores_json,
    snapshotPayload.key_aggregates_json
  );

  const signalMap = signalByKey(signalRows);
  const scoreMap = scoreByType(scoreRows);
  const inferredOutcomes = outcomeFromSignals(snapshotDate, signalMap, scoreMap).map((item) => ({
    ...item,
    dedupe_key: buildDedupeKey(scope.projectId, item.outcome_type, item.occurred_at, item.notes),
  }));
  const dealOutcomes = await deriveDealStageOutcomes(pool, scope, snapshotDate);
  const outcomesInserted = await upsertOutcomes(pool, scope, [...inferredOutcomes, ...dealOutcomes]);

  return {
    snapshot_date: snapshotDate,
    signals_count: signalRows.length,
    scores_count: scoreRows.length,
    outcomes_touched: outcomesInserted,
    key_aggregates: aggregates,
  };
}

export async function listProjectSnapshots(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "30"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 365)) : 30;
  const { rows } = await pool.query(
    `
      SELECT
        id,
        snapshot_date,
        signals_json,
        normalized_signals_json,
        scores_json,
        key_aggregates_json,
        created_at
      FROM project_snapshots
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY snapshot_date DESC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, limit]
  );
  return rows;
}

export async function listPastCaseOutcomes(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 100;
  const outcomeType = String(options.outcome_type || "").trim().toLowerCase();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        outcome_type,
        occurred_at,
        severity,
        notes,
        evidence_refs,
        source_event_id,
        created_at
      FROM past_case_outcomes
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR outcome_type = $3)
      ORDER BY occurred_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, outcomeType, limit]
  );
  return rows;
}
