import crypto from "node:crypto";
import { failProcessRun, finishProcessRun, startProcessRun, warnProcess } from "./kag-process-log.js";

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

function toIso(value, fallback = null) {
  const date = toDate(value, fallback ? toDate(fallback) : null);
  return date ? date.toISOString() : null;
}

function featureValue(signalsJson, key) {
  const value = signalsJson?.[key]?.value;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function avg(numbers) {
  if (!numbers.length) return 0;
  const total = numbers.reduce((acc, item) => acc + Number(item || 0), 0);
  return total / numbers.length;
}

function delta(numbers) {
  if (numbers.length < 2) return 0;
  return Number(numbers[numbers.length - 1] || 0) - Number(numbers[0] || 0);
}

function euclideanDistance(a = [], b = []) {
  const len = Math.max(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const left = Number(a[i] || 0);
    const right = Number(b[i] || 0);
    const diff = left - right;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function setFromArray(values = []) {
  const out = new Set();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    out.add(normalized);
  }
  return out;
}

function jaccardSimilarity(leftSet, rightSet) {
  const left = leftSet || new Set();
  const right = rightSet || new Set();
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

function contextSimilarity(left = {}, right = {}) {
  let score = 0;
  if (left.budget_bucket && right.budget_bucket && left.budget_bucket === right.budget_bucket) score += 0.4;
  if (left.project_type && right.project_type && left.project_type === right.project_type) score += 0.3;
  if (left.stage_bucket && right.stage_bucket && left.stage_bucket === right.stage_bucket) score += 0.3;
  return clamp(score, 0, 1);
}

function budgetBucket(amount) {
  const value = Number(amount || 0);
  if (value >= 200_000) return "xl";
  if (value >= 100_000) return "lg";
  if (value >= 50_000) return "md";
  if (value >= 10_000) return "sm";
  return "xs";
}

function projectTypeFromName(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("support")) return "support";
  if (text.includes("growth")) return "growth";
  if (text.includes("migration")) return "migration";
  if (text.includes("integration")) return "integration";
  return "delivery";
}

function makeSignatureHash(vector, eventNgrams) {
  return crypto
    .createHash("sha1")
    .update(`${JSON.stringify(vector)}|${JSON.stringify([...eventNgrams].sort())}`)
    .digest("hex");
}

function buildEventNgrams(eventTypes = []) {
  const ngrams = [];
  for (let i = 0; i < eventTypes.length - 1; i++) {
    const left = String(eventTypes[i] || "").trim();
    const right = String(eventTypes[i + 1] || "").trim();
    if (!left || !right) continue;
    ngrams.push(`${left}>${right}`);
  }
  return ngrams;
}

function selectSharedPatterns(sourceNgrams = [], candidateNgrams = [], max = 5) {
  const sourceSet = new Set(sourceNgrams);
  const shared = [];
  for (const ngram of candidateNgrams) {
    if (!sourceSet.has(ngram)) continue;
    if (shared.includes(ngram)) continue;
    shared.push(ngram);
    if (shared.length >= max) break;
  }
  return shared;
}

async function loadProjectMeta(pool, projectId) {
  const { rows } = await pool.query(
    `
      SELECT id, name, account_scope_id
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [projectId]
  );
  return rows[0] || null;
}

async function loadSnapshotWindow(pool, projectId, accountScopeId, windowDays) {
  const { rows } = await pool.query(
    `
      SELECT
        snapshot_date,
        signals_json,
        normalized_signals_json,
        scores_json,
        key_aggregates_json
      FROM project_snapshots
      WHERE project_id = $1
        AND account_scope_id = $2
        AND snapshot_date >= current_date - (($3::int - 1) * interval '1 day')
      ORDER BY snapshot_date ASC
    `,
    [projectId, accountScopeId, windowDays]
  );
  return rows;
}

async function loadEventTypesWindow(pool, projectId, accountScopeId, windowDays) {
  const { rows } = await pool.query(
    `
      SELECT event_type
      FROM kag_event_log
      WHERE project_id = $1
        AND account_scope_id = $2
        AND occurred_at >= now() - (($3::int)::text || ' days')::interval
      ORDER BY occurred_at ASC, id ASC
      LIMIT 5000
    `,
    [projectId, accountScopeId, windowDays]
  );
  return rows.map((row) => row.event_type);
}

function vectorFromSnapshots(snapshots) {
  const waiting = snapshots.map((row) => featureValue(row.signals_json || {}, "waiting_on_client_days"));
  const blockers = snapshots.map((row) => featureValue(row.signals_json || {}, "blockers_age"));
  const stage = snapshots.map((row) => featureValue(row.signals_json || {}, "stage_overdue"));
  const scope = snapshots.map((row) => featureValue(row.signals_json || {}, "scope_creep_rate"));
  const burn = snapshots.map((row) => featureValue(row.signals_json || {}, "budget_burn_rate"));
  const margin = snapshots.map((row) => featureValue(row.signals_json || {}, "margin_risk"));
  const activity = snapshots.map((row) => featureValue(row.signals_json || {}, "activity_drop"));
  const sentiment = snapshots.map((row) => featureValue(row.signals_json || {}, "sentiment_trend"));
  const riskScore = snapshots.map((row) => Number(row.scores_json?.risk?.score || 0));
  const healthScore = snapshots.map((row) => Number(row.scores_json?.project_health?.score || 100));
  const events7d = snapshots.map((row) => Number(row.key_aggregates_json?.events?.events_7d || 0));

  const vector = [
    clamp(avg(waiting) / 7, 0, 1),
    clamp(avg(blockers) / 7, 0, 1),
    clamp(avg(stage) / 5, 0, 1),
    clamp(avg(scope) / 0.5, 0, 1),
    clamp((avg(burn) - 1) / 0.5, 0, 1),
    clamp(avg(margin), 0, 1),
    clamp(avg(activity), 0, 1),
    clamp(Math.abs(Math.min(avg(sentiment), 0)) / 0.4, 0, 1),
    clamp(avg(riskScore) / 100, 0, 1),
    clamp(1 - avg(healthScore) / 100, 0, 1),
    clamp(avg(events7d) / 50, 0, 1),
    clamp(delta(riskScore) / 40, -1, 1),
    clamp(delta(waiting) / 7, -1, 1),
    clamp(delta(scope) / 0.4, -1, 1),
  ];

  return {
    vector: vector.map((item) => Number(item.toFixed(5))),
    features: {
      waiting_avg: Number(avg(waiting).toFixed(4)),
      blockers_avg: Number(avg(blockers).toFixed(4)),
      stage_overdue_avg: Number(avg(stage).toFixed(4)),
      scope_creep_avg: Number(avg(scope).toFixed(4)),
      burn_rate_avg: Number(avg(burn).toFixed(4)),
      margin_risk_avg: Number(avg(margin).toFixed(4)),
      activity_drop_avg: Number(avg(activity).toFixed(4)),
      sentiment_trend_avg: Number(avg(sentiment).toFixed(4)),
      risk_score_avg: Number(avg(riskScore).toFixed(4)),
      health_score_avg: Number(avg(healthScore).toFixed(4)),
      events_7d_avg: Number(avg(events7d).toFixed(4)),
      waiting_delta: Number(delta(waiting).toFixed(4)),
      risk_delta: Number(delta(riskScore).toFixed(4)),
    },
  };
}

async function computeContext(pool, projectMeta, snapshots, accountScopeId) {
  const latestSnapshot = snapshots[snapshots.length - 1] || null;
  const pipelineAmount = Number(latestSnapshot?.key_aggregates_json?.revenue?.pipeline_amount || 0);
  const budgetBucketValue = budgetBucket(pipelineAmount);
  const projectType = projectTypeFromName(projectMeta?.name || "");
  const { rows } = await pool.query(
    `
      SELECT stage
      FROM attio_opportunities_raw
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [projectMeta.id, accountScopeId]
  );
  const stage = String(rows[0]?.stage || "").toLowerCase();
  const stageBucket = stage.includes("proposal")
    ? "proposal"
    : stage.includes("negotiation")
      ? "negotiation"
      : stage.includes("won")
        ? "won"
        : stage.includes("lost")
          ? "lost"
          : "discovery";
  return {
    project_type: projectType,
    budget_bucket: budgetBucketValue,
    stage_bucket: stageBucket,
    pipeline_amount: pipelineAmount,
  };
}

export async function buildCaseSignature(pool, scope, options = {}) {
  const windowDaysRaw = Number.parseInt(String(options.window_days || "14"), 10);
  const windowDays = [7, 14, 30].includes(windowDaysRaw) ? windowDaysRaw : 14;
  const projectId = String(options.project_id || scope.projectId);
  const projectMeta = await loadProjectMeta(pool, projectId);
  if (!projectMeta) throw new Error("project_not_found");

  const snapshots = await loadSnapshotWindow(pool, projectId, scope.accountScopeId, windowDays);
  if (!snapshots.length) {
    return {
      project_id: projectId,
      window_days: windowDays,
      skipped: "no_snapshots",
    };
  }

  const eventTypes = await loadEventTypesWindow(pool, projectId, scope.accountScopeId, windowDays);
  const eventNgrams = buildEventNgrams(eventTypes);
  const vectorPack = vectorFromSnapshots(snapshots);
  const context = await computeContext(pool, projectMeta, snapshots, scope.accountScopeId);
  const signatureHash = makeSignatureHash(vectorPack.vector, setFromArray(eventNgrams));

  await pool.query(
    `
      INSERT INTO case_signatures(
        project_id,
        account_scope_id,
        window_days,
        signature_vector,
        signature_hash,
        features_json,
        context_json,
        computed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, now(), now())
      ON CONFLICT (project_id, window_days)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        signature_vector = EXCLUDED.signature_vector,
        signature_hash = EXCLUDED.signature_hash,
        features_json = EXCLUDED.features_json,
        context_json = EXCLUDED.context_json,
        computed_at = now(),
        updated_at = now()
    `,
    [
      projectId,
      scope.accountScopeId,
      windowDays,
      JSON.stringify(vectorPack.vector),
      signatureHash,
      JSON.stringify({
        ...vectorPack.features,
        event_types: eventTypes.slice(-500),
        event_ngrams: eventNgrams.slice(-1000),
      }),
      JSON.stringify(context),
    ]
  );

  return {
    project_id: projectId,
    window_days: windowDays,
    signature_hash: signatureHash,
    features: vectorPack.features,
    context,
  };
}

export async function rebuildCaseSignatures(pool, scope, options = {}) {
  const run = await startProcessRun(pool, scope, "similarity_rebuild", {
    source: "system",
    payload: {
      project_id: options.project_id || scope.projectId,
      window_days: options.window_days || null,
    },
  });
  try {
  const projectId = options.project_id ? String(options.project_id) : scope.projectId;
  const windows = options.window_days ? [Number(options.window_days)] : [7, 14, 30];
  const results = [];
  for (const windowDays of windows) {
    results.push(
      await buildCaseSignature(pool, scope, {
        project_id: projectId,
        window_days: windowDays,
      })
    );
  }
  const skipped = results.filter((item) => item?.skipped).length;
  if (skipped > 0) {
    await warnProcess(pool, scope, "similarity_rebuild", "Some windows skipped due to missing snapshots", {
      payload: {
        skipped,
      },
    });
  }
  await finishProcessRun(pool, scope, run, {
    counters: {
      windows: windows.length,
      completed: results.length - skipped,
      skipped,
    },
    payload: { results },
  });
  return results;
  } catch (error) {
    await failProcessRun(pool, scope, run, error, {});
    throw error;
  }
}

async function loadSignatureRow(pool, projectId, accountScopeId, windowDays) {
  const { rows } = await pool.query(
    `
      SELECT
        project_id,
        window_days,
        signature_vector,
        signature_hash,
        features_json,
        context_json,
        computed_at
      FROM case_signatures
      WHERE project_id = $1
        AND account_scope_id = $2
        AND window_days = $3
      LIMIT 1
    `,
    [projectId, accountScopeId, windowDays]
  );
  return rows[0] || null;
}

async function loadCandidateSignatures(pool, accountScopeId, projectId, windowDays, limit = 200) {
  const { rows } = await pool.query(
    `
      SELECT
        s.project_id,
        p.name AS project_name,
        s.window_days,
        s.signature_vector,
        s.features_json,
        s.context_json,
        s.computed_at
      FROM case_signatures AS s
      JOIN projects AS p ON p.id = s.project_id
      WHERE s.account_scope_id = $1
        AND s.window_days = $2
        AND s.project_id <> $3
      ORDER BY s.updated_at DESC
      LIMIT $4
    `,
    [accountScopeId, windowDays, projectId, limit]
  );
  return rows;
}

async function loadProjectOutcomes(pool, projectId, accountScopeId, limit = 12) {
  const { rows } = await pool.query(
    `
      SELECT outcome_type, occurred_at, severity, notes, evidence_refs
      FROM past_case_outcomes
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
    `,
    [projectId, accountScopeId, limit]
  );
  return rows;
}

function similarityExplanation(tsScore, seqScore, contextScore) {
  return `time_series=${tsScore.toFixed(3)}, event_sequence=${seqScore.toFixed(3)}, context=${contextScore.toFixed(3)}`;
}

export function rankSimilarCasesFromSignatures(sourceSignature, candidates = [], topK = 3) {
  const sourceVector = Array.isArray(sourceSignature?.signature_vector)
    ? sourceSignature.signature_vector.map(Number)
    : [];
  const sourceNgrams = setFromArray(sourceSignature?.features_json?.event_ngrams || []);
  const sourceContext = sourceSignature?.context_json || {};
  const scored = [];
  for (const candidate of candidates) {
    const candidateVector = Array.isArray(candidate?.signature_vector) ? candidate.signature_vector.map(Number) : [];
    const tsDistance = euclideanDistance(sourceVector, candidateVector);
    const tsScore = 1 / (1 + tsDistance);
    const candidateNgrams = setFromArray(candidate?.features_json?.event_ngrams || []);
    const seqScore = jaccardSimilarity(sourceNgrams, candidateNgrams);
    const ctxScore = contextSimilarity(sourceContext, candidate?.context_json || {});
    const similarityScore = clamp(0.6 * tsScore + 0.3 * seqScore + 0.1 * ctxScore, 0, 1);
    const sharedPatterns = selectSharedPatterns(
      sourceSignature?.features_json?.event_ngrams || [],
      candidate?.features_json?.event_ngrams || [],
      5
    );
    scored.push({
      case_project_id: candidate.project_id,
      case_project_name: candidate.project_name || null,
      similarity_score: Number(similarityScore.toFixed(4)),
      why_similar: similarityExplanation(tsScore, seqScore, ctxScore),
      key_shared_patterns: sharedPatterns,
      outcomes_seen: candidate.outcomes_seen || [],
      computed_at: candidate.computed_at || null,
    });
  }
  scored.sort((a, b) => b.similarity_score - a.similarity_score);
  return scored.slice(0, Math.max(1, Math.min(topK, 50)));
}

export async function findSimilarCases(pool, scope, options = {}) {
  const projectId = String(options.project_id || scope.projectId);
  const windowDaysRaw = Number.parseInt(String(options.window_days || "14"), 10);
  const windowDays = [7, 14, 30].includes(windowDaysRaw) ? windowDaysRaw : 14;
  const topKRaw = Number.parseInt(String(options.top_k || "5"), 10);
  const topK = Number.isFinite(topKRaw) ? Math.max(1, Math.min(topKRaw, 50)) : 5;

  let sourceSignature = await loadSignatureRow(pool, projectId, scope.accountScopeId, windowDays);
  if (!sourceSignature) {
    await buildCaseSignature(pool, scope, { project_id: projectId, window_days: windowDays });
    sourceSignature = await loadSignatureRow(pool, projectId, scope.accountScopeId, windowDays);
  }
  if (!sourceSignature) {
    return [];
  }

  const candidateRows = await loadCandidateSignatures(pool, scope.accountScopeId, projectId, windowDays, 300);
  const candidatesWithOutcomes = [];
  for (const candidate of candidateRows) {
    const outcomes = await loadProjectOutcomes(pool, candidate.project_id, scope.accountScopeId, 8);
    candidatesWithOutcomes.push({
      ...candidate,
      outcomes_seen: outcomes,
    });
  }
  return rankSimilarCasesFromSignatures(sourceSignature, candidatesWithOutcomes, topK);
}
