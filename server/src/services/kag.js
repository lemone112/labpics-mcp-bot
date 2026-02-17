import { applyEventsIncrementally, computeSignalsFromState, createInitialSignalState } from "../kag/signals/index.js";
import { computeScores } from "../kag/scoring/index.js";
import { generateRecommendations } from "../kag/recommendations/index.js";
import { buildProjectSnapshot } from "./snapshots.js";

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

function toLimit(value, fallback = 500, min = 1, max = 5_000) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeEventRow(row) {
  const sourceRefs = Array.isArray(row?.source_refs) ? row.source_refs : [];
  const ragRefs = Array.isArray(row?.rag_chunk_refs)
    ? row.rag_chunk_refs.map((chunkId) => ({
        rag_chunk_id: String(chunkId),
        source_table: "rag_chunks",
        source_pk: String(chunkId),
      }))
    : [];
  return {
    id: row.id,
    event_type: row.event_type,
    event_ts: row.event_ts,
    payload: row.payload || {},
    evidence_refs: [...sourceRefs, ...ragRefs],
  };
}

async function fetchSignalState(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT project_id, account_scope_id, last_event_id, state_payload, updated_at
      FROM kag_signal_state
      WHERE project_id = $1
        AND account_scope_id = $2
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows[0] || null;
}

async function fetchKagEvents(pool, scope, lastEventId = 0, limit = 500) {
  const { rows } = await pool.query(
    `
      SELECT id, event_type, event_ts, payload, source_refs, rag_chunk_refs
      FROM kag_events
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id > $3
      ORDER BY id ASC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, Math.max(0, Number(lastEventId) || 0), toLimit(limit, 500)]
  );
  return rows.map(normalizeEventRow);
}

async function upsertSignalState(pool, scope, state, lastEventId) {
  await pool.query(
    `
      INSERT INTO kag_signal_state(project_id, account_scope_id, last_event_id, state_payload, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, now())
      ON CONFLICT (project_id)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        last_event_id = EXCLUDED.last_event_id,
        state_payload = EXCLUDED.state_payload,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, Number(lastEventId || 0), JSON.stringify(state || {})]
  );
}

async function upsertSignals(pool, scope, signals = []) {
  if (!signals.length) return { touched: 0 };
  const payload = signals.map((signal) => ({
    signal_key: signal.signal_key,
    value: Number(signal.value || 0),
    status: String(signal.status || "ok"),
    threshold_warn: signal.threshold_warn,
    threshold_critical: signal.threshold_critical,
    details: signal.details || {},
    evidence_refs: signal.evidence_refs || [],
    computed_at: signal.computed_at || new Date().toISOString(),
  }));

  const result = await pool.query(
    `
      INSERT INTO kag_signals(
        project_id,
        account_scope_id,
        signal_key,
        value,
        status,
        threshold_warn,
        threshold_critical,
        details,
        evidence_refs,
        computed_at,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.signal_key,
        x.value,
        x.status,
        x.threshold_warn,
        x.threshold_critical,
        x.details,
        x.evidence_refs,
        x.computed_at::timestamptz,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        signal_key text,
        value numeric,
        status text,
        threshold_warn numeric,
        threshold_critical numeric,
        details jsonb,
        evidence_refs jsonb,
        computed_at text
      )
      ON CONFLICT (project_id, signal_key)
      DO UPDATE SET
        value = EXCLUDED.value,
        status = EXCLUDED.status,
        threshold_warn = EXCLUDED.threshold_warn,
        threshold_critical = EXCLUDED.threshold_critical,
        details = EXCLUDED.details,
        evidence_refs = EXCLUDED.evidence_refs,
        computed_at = EXCLUDED.computed_at,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );

  await pool.query(
    `
      INSERT INTO kag_signal_history(
        project_id,
        account_scope_id,
        signal_key,
        value,
        status,
        details,
        evidence_refs,
        computed_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.signal_key,
        x.value,
        x.status,
        x.details,
        x.evidence_refs,
        x.computed_at::timestamptz
      FROM jsonb_to_recordset($3::jsonb) AS x(
        signal_key text,
        value numeric,
        status text,
        threshold_warn numeric,
        threshold_critical numeric,
        details jsonb,
        evidence_refs jsonb,
        computed_at text
      )
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );

  return { touched: result.rowCount || 0 };
}

async function upsertScores(pool, scope, scores = []) {
  if (!scores.length) return { touched: 0 };
  const payload = scores.map((score) => ({
    score_type: score.score_type,
    score: Number(score.score || 0),
    level: String(score.level || "low"),
    weights: score.weights || {},
    thresholds: score.thresholds || {},
    factors: score.factors || [],
    evidence_refs: score.evidence_refs || [],
    computed_at: score.computed_at || new Date().toISOString(),
  }));

  const result = await pool.query(
    `
      INSERT INTO kag_scores(
        project_id,
        account_scope_id,
        score_type,
        score,
        level,
        weights,
        thresholds,
        factors,
        evidence_refs,
        computed_at,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.score_type,
        x.score,
        x.level,
        x.weights,
        x.thresholds,
        x.factors,
        x.evidence_refs,
        x.computed_at::timestamptz,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        score_type text,
        score numeric,
        level text,
        weights jsonb,
        thresholds jsonb,
        factors jsonb,
        evidence_refs jsonb,
        computed_at text
      )
      ON CONFLICT (project_id, score_type)
      DO UPDATE SET
        score = EXCLUDED.score,
        level = EXCLUDED.level,
        weights = EXCLUDED.weights,
        thresholds = EXCLUDED.thresholds,
        factors = EXCLUDED.factors,
        evidence_refs = EXCLUDED.evidence_refs,
        computed_at = EXCLUDED.computed_at,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );

  await pool.query(
    `
      INSERT INTO kag_score_history(
        project_id,
        account_scope_id,
        score_type,
        score,
        level,
        factors,
        evidence_refs,
        computed_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.score_type,
        x.score,
        x.level,
        x.factors,
        x.evidence_refs,
        x.computed_at::timestamptz
      FROM jsonb_to_recordset($3::jsonb) AS x(
        score_type text,
        score numeric,
        level text,
        weights jsonb,
        thresholds jsonb,
        factors jsonb,
        evidence_refs jsonb,
        computed_at text
      )
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );

  return { touched: result.rowCount || 0 };
}

async function upsertRecommendations(pool, scope, recommendations = []) {
  if (!recommendations.length) return { touched: 0 };
  const payload = recommendations.map((item) => ({
    category: item.category,
    priority: Number(item.priority || 3),
    status: String(item.status || "proposed"),
    title: String(item.title || "").slice(0, 500),
    rationale: String(item.rationale || "").slice(0, 3000),
    suggested_template_key: String(item.suggested_template_key || "").slice(0, 200),
    suggested_template: String(item.suggested_template || "").slice(0, 12_000),
    evidence_refs: item.evidence_refs || [],
    signal_snapshot: item.signal_snapshot || {},
    score_snapshot: item.score_snapshot || {},
    dedupe_key: String(item.dedupe_key || "").slice(0, 200),
  }));

  const result = await pool.query(
    `
      INSERT INTO kag_recommendations(
        project_id,
        account_scope_id,
        category,
        priority,
        status,
        title,
        rationale,
        suggested_template_key,
        suggested_template,
        evidence_refs,
        signal_snapshot,
        score_snapshot,
        dedupe_key,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.category,
        x.priority,
        x.status,
        x.title,
        x.rationale,
        x.suggested_template_key,
        x.suggested_template,
        x.evidence_refs,
        x.signal_snapshot,
        x.score_snapshot,
        x.dedupe_key,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        category text,
        priority int,
        status text,
        title text,
        rationale text,
        suggested_template_key text,
        suggested_template text,
        evidence_refs jsonb,
        signal_snapshot jsonb,
        score_snapshot jsonb,
        dedupe_key text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        priority = EXCLUDED.priority,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        rationale = EXCLUDED.rationale,
        suggested_template_key = EXCLUDED.suggested_template_key,
        suggested_template = EXCLUDED.suggested_template,
        evidence_refs = EXCLUDED.evidence_refs,
        signal_snapshot = EXCLUDED.signal_snapshot,
        score_snapshot = EXCLUDED.score_snapshot,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return { touched: result.rowCount || 0 };
}

async function markEventsProcessed(pool, scope, events = []) {
  if (!events.length) return 0;
  const ids = events.map((event) => Number(event.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return 0;
  const result = await pool.query(
    `
      UPDATE kag_events
      SET status = 'processed',
          processed_at = now()
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::bigint[])
    `,
    [scope.projectId, scope.accountScopeId, ids]
  );
  return result.rowCount || 0;
}

export async function runKagRecommendationRefresh(pool, scope, options = {}) {
  const enabled = envFlag("KAG_ENABLED", false);
  if (!enabled) {
    return {
      enabled: false,
      recommendations_enabled: false,
      skipped: "kag_disabled",
      touched_signals: 0,
      touched_scores: 0,
      touched_recommendations: 0,
      processed_events: 0,
    };
  }

  const recommendationsEnabled = envFlag("RECOMMENDATIONS_ENABLED", false);
  const now = options.now || new Date();
  const eventLimit = toLimit(options.eventLimit, 1_000);

  const stateRow = await fetchSignalState(pool, scope);
  const previousState =
    stateRow?.state_payload && typeof stateRow.state_payload === "object"
      ? stateRow.state_payload
      : createInitialSignalState(now);
  const lastEventId = Number(stateRow?.last_event_id || 0);

  const events = await fetchKagEvents(pool, scope, lastEventId, eventLimit);
  const incremental = applyEventsIncrementally(previousState, events, { now });
  const signals = computeSignalsFromState(incremental.state, { now }).map((row) => ({
    ...row,
    computed_at: new Date(now).toISOString(),
  }));
  const scoring = computeScores({ signals, state: incremental.state, now });

  await upsertSignalState(pool, scope, incremental.state, incremental.last_event_id || lastEventId);
  const signalResult = await upsertSignals(pool, scope, signals);
  const scoreResult = await upsertScores(pool, scope, scoring.scores);

  let recommendationResult = { touched: 0 };
  let recommendations = [];
  if (recommendationsEnabled) {
    recommendations = await generateRecommendations({
      signals,
      scores: scoring.scores,
      state: incremental.state,
      now,
      llmGenerateTemplate: options.llmGenerateTemplate || null,
    });
    recommendationResult = await upsertRecommendations(pool, scope, recommendations);
  }

  let snapshotResult = null;
  if (envFlag("KAG_SNAPSHOTS_ENABLED", true)) {
    snapshotResult = await buildProjectSnapshot(pool, scope, { snapshot_date: now });
  }

  const processedEvents = await markEventsProcessed(pool, scope, events);

  return {
    enabled: true,
    recommendations_enabled: recommendationsEnabled,
    processed_events: processedEvents,
    touched_signals: signalResult.touched,
    touched_scores: scoreResult.touched,
    touched_recommendations: recommendationResult.touched,
    generated_recommendations: recommendations.length,
    last_event_id: incremental.last_event_id || lastEventId,
    snapshot: snapshotResult,
  };
}

export async function listKagSignals(pool, scope, limit = 100) {
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
        computed_at,
        updated_at
      FROM kag_signals
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, toLimit(limit, 100, 1, 500)]
  );
  return rows;
}

export async function listKagScores(pool, scope, limit = 20) {
  const { rows } = await pool.query(
    `
      SELECT
        score_type,
        score,
        level,
        weights,
        thresholds,
        factors,
        evidence_refs,
        computed_at,
        updated_at
      FROM kag_scores
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, toLimit(limit, 20, 1, 100)]
  );
  return rows;
}

export async function listKagRecommendations(pool, scope, options = {}) {
  const status = String(options.status || "").trim().toLowerCase();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        category,
        priority,
        status,
        title,
        rationale,
        suggested_template_key,
        suggested_template,
        evidence_refs,
        signal_snapshot,
        score_snapshot,
        created_at,
        updated_at
      FROM kag_recommendations
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY priority DESC, updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status, toLimit(options.limit, 100, 1, 500)]
  );
  return rows;
}
