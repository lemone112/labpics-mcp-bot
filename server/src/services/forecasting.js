import { findSimilarCases } from "./similarity.js";
import { failProcessRun, finishProcessRun, startProcessRun, warnProcess } from "./kag-process-log.js";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
}

function mapByKey(items = [], keyField) {
  const out = {};
  for (const item of items) {
    const key = item?.[keyField];
    if (!key) continue;
    out[key] = item;
  }
  return out;
}

function signalValue(signalMap, signalKey) {
  return Number(signalMap?.[signalKey]?.value || 0);
}

function collectEvidenceRefs(items = [], max = 40) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    for (const ref of item?.evidence_refs || []) {
      const key = JSON.stringify(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function normalizeSignalValue(signal, divisor, comparator = "high") {
  const value = Number(signal?.value || 0);
  if (comparator === "negative") {
    return value < 0 ? clamp(Math.abs(value) / Math.max(0.0001, divisor), 0, 1) : 0;
  }
  return clamp(value / Math.max(0.0001, divisor), 0, 1);
}

function extractSimilarOutcomeScore(similarCases = [], riskType) {
  let weighted = 0;
  let totalWeight = 0;
  for (const entry of similarCases) {
    const similarity = Number(entry.similarity_score || 0);
    if (similarity <= 0) continue;
    const outcomes = Array.isArray(entry.outcomes_seen) ? entry.outcomes_seen : [];
    const matched = outcomes.filter((outcome) => String(outcome.outcome_type || "") === riskType);
    if (!matched.length) continue;
    const severityAvg =
      matched.reduce((acc, item) => acc + Number(item.severity || 3), 0) / Math.max(1, matched.length);
    const normalizedSeverity = clamp(severityAvg / 5, 0, 1);
    weighted += similarity * normalizedSeverity;
    totalWeight += similarity;
  }
  if (totalWeight <= 0) return 0;
  return clamp(weighted / totalWeight, 0, 1);
}

function makeDrivers(entries = []) {
  return entries
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 4)
    .map((entry) => ({
      key: entry.key,
      contribution: round(entry.value, 4),
    }));
}

export function computeRiskForecastsFromInputs({ signals = [], scores = [], similarCases = [], now = new Date() }) {
  const signalMap = mapByKey(signals, "signal_key");
  const scoreMap = mapByKey(scores, "score_type");
  const riskScoreNorm = clamp(Number(scoreMap.risk?.score || 0) / 100, 0, 1);

  const waitingNorm = normalizeSignalValue(signalMap.waiting_on_client_days, 6, "high");
  const responseNorm = normalizeSignalValue(signalMap.response_time_avg, 720, "high");
  const blockersNorm = normalizeSignalValue(signalMap.blockers_age, 7, "high");
  const stageNorm = normalizeSignalValue(signalMap.stage_overdue, 5, "high");
  const scopeNorm = normalizeSignalValue(signalMap.scope_creep_rate, 0.5, "high");
  const burnNorm = signalMap.budget_burn_rate
    ? clamp((Number(signalMap.budget_burn_rate.value || 0) - 1) / 0.5, 0, 1)
    : 0;
  const marginNorm = normalizeSignalValue(signalMap.margin_risk, 1, "high");
  const sentimentNorm = normalizeSignalValue(signalMap.sentiment_trend, 0.4, "negative");
  const activityNorm = normalizeSignalValue(signalMap.activity_drop, 1, "high");

  const baselines = {
    delivery_risk: clamp(
      0.32 * blockersNorm + 0.28 * stageNorm + 0.12 * responseNorm + 0.1 * activityNorm + 0.18 * riskScoreNorm,
      0,
      1
    ),
    finance_risk: clamp(0.4 * burnNorm + 0.35 * marginNorm + 0.25 * riskScoreNorm, 0, 1),
    client_risk: clamp(0.32 * waitingNorm + 0.24 * sentimentNorm + 0.12 * responseNorm + 0.12 * activityNorm + 0.2 * riskScoreNorm, 0, 1),
    scope_risk: clamp(0.48 * scopeNorm + 0.18 * stageNorm + 0.14 * waitingNorm + 0.2 * riskScoreNorm, 0, 1),
  };

  if (signalValue(signalMap, "waiting_on_client_days") >= 4) {
    baselines.client_risk = Math.max(baselines.client_risk, 0.62);
  }
  if (signalValue(signalMap, "sentiment_trend") <= -0.25) {
    baselines.client_risk = Math.max(baselines.client_risk, 0.55);
  }
  if (
    signalValue(signalMap, "blockers_age") >= 5 &&
    Number(signalMap.blockers_age?.details?.open_blockers || 0) >= 3
  ) {
    baselines.delivery_risk = Math.max(baselines.delivery_risk, 0.62);
  }
  if (signalValue(signalMap, "stage_overdue") >= 3) {
    baselines.delivery_risk = Math.max(baselines.delivery_risk, 0.58);
  }
  if (signalValue(signalMap, "budget_burn_rate") >= 1.2 || signalValue(signalMap, "margin_risk") >= 0.4) {
    baselines.finance_risk = Math.max(baselines.finance_risk, 0.62);
  }
  if (signalValue(signalMap, "scope_creep_rate") >= 0.35) {
    baselines.scope_risk = Math.max(baselines.scope_risk, 0.6);
  }

  const riskConfigs = {
    delivery_risk: [
      { key: "blockers_age", value: blockersNorm },
      { key: "stage_overdue", value: stageNorm },
      { key: "response_time_avg", value: responseNorm },
      { key: "activity_drop", value: activityNorm },
      { key: "risk_score", value: riskScoreNorm },
    ],
    finance_risk: [
      { key: "budget_burn_rate", value: burnNorm },
      { key: "margin_risk", value: marginNorm },
      { key: "risk_score", value: riskScoreNorm },
    ],
    client_risk: [
      { key: "waiting_on_client_days", value: waitingNorm },
      { key: "sentiment_trend", value: sentimentNorm },
      { key: "response_time_avg", value: responseNorm },
      { key: "activity_drop", value: activityNorm },
      { key: "risk_score", value: riskScoreNorm },
    ],
    scope_risk: [
      { key: "scope_creep_rate", value: scopeNorm },
      { key: "stage_overdue", value: stageNorm },
      { key: "waiting_on_client_days", value: waitingNorm },
      { key: "risk_score", value: riskScoreNorm },
    ],
  };

  const generatedAt = new Date(now).toISOString();
  const forecasts = [];
  for (const riskType of Object.keys(baselines)) {
    const baseline7d = baselines[riskType];
    const similarCaseScore = extractSimilarOutcomeScore(similarCases, riskType);
    const probability7d = clamp(0.75 * baseline7d + 0.25 * similarCaseScore, 0, 1);
    const growth14 = 0.12 + 0.18 * similarCaseScore;
    const growth30 = 0.18 + 0.22 * similarCaseScore;
    const probability14d = clamp(probability7d + growth14 * (1 - probability7d), 0, 1);
    const probability30d = clamp(probability14d + growth30 * (1 - probability14d), 0, 1);
    const expectedTime = probability30d < 0.05 ? 60 : clamp((1 - probability30d) * 40 + 2, 2, 60);
    const evidence = collectEvidenceRefs(
      [signalMap.waiting_on_client_days, signalMap.stage_overdue, signalMap.blockers_age, signalMap.scope_creep_rate, signalMap.margin_risk, signalMap.budget_burn_rate, signalMap.sentiment_trend].filter(Boolean),
      40
    );
    const confidence = clamp(0.35 + Math.min(0.45, similarCases.length * 0.08) + Math.min(0.2, evidence.length * 0.01), 0, 1);

    forecasts.push({
      risk_type: riskType,
      probability_7d: round(probability7d, 4),
      probability_14d: round(probability14d, 4),
      probability_30d: round(probability30d, 4),
      expected_time_to_risk_days: round(expectedTime, 2),
      confidence: round(confidence, 4),
      top_drivers: makeDrivers(riskConfigs[riskType] || []),
      similar_cases: similarCases.slice(0, 3).map((item) => ({
        case_project_id: item.case_project_id,
        similarity_score: item.similarity_score,
        outcomes_seen: item.outcomes_seen,
        why_similar: item.why_similar,
      })),
      evidence_refs: evidence,
      publishable: evidence.length > 0,
      generated_at: generatedAt,
    });
  }

  return forecasts;
}

async function fetchSignals(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT signal_key, value, status, details, evidence_refs
      FROM kag_signals
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function fetchScores(pool, scope) {
  const { rows } = await pool.query(
    `
      SELECT score_type, score, level, factors, evidence_refs
      FROM kag_scores
      WHERE project_id = $1
        AND account_scope_id = $2
    `,
    [scope.projectId, scope.accountScopeId]
  );
  return rows;
}

async function upsertForecasts(pool, scope, forecasts = []) {
  if (!forecasts.length) return 0;
  const payload = forecasts.map((item) => ({
    risk_type: item.risk_type,
    probability_7d: item.probability_7d,
    probability_14d: item.probability_14d,
    probability_30d: item.probability_30d,
    expected_time_to_risk_days: item.expected_time_to_risk_days,
    confidence: item.confidence,
    top_drivers: item.top_drivers || [],
    similar_cases: item.similar_cases || [],
    evidence_refs: item.evidence_refs || [],
    publishable: Boolean(item.publishable),
    generated_at: item.generated_at || new Date().toISOString(),
  }));

  const result = await pool.query(
    `
      INSERT INTO kag_risk_forecasts(
        project_id,
        account_scope_id,
        risk_type,
        probability_7d,
        probability_14d,
        probability_30d,
        expected_time_to_risk_days,
        confidence,
        top_drivers,
        similar_cases,
        evidence_refs,
        publishable,
        generated_at,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.risk_type,
        x.probability_7d,
        x.probability_14d,
        x.probability_30d,
        x.expected_time_to_risk_days,
        x.confidence,
        x.top_drivers,
        x.similar_cases,
        x.evidence_refs,
        x.publishable,
        x.generated_at::timestamptz,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        risk_type text,
        probability_7d numeric,
        probability_14d numeric,
        probability_30d numeric,
        expected_time_to_risk_days numeric,
        confidence numeric,
        top_drivers jsonb,
        similar_cases jsonb,
        evidence_refs jsonb,
        publishable boolean,
        generated_at text
      )
      ON CONFLICT (project_id, risk_type)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        probability_7d = EXCLUDED.probability_7d,
        probability_14d = EXCLUDED.probability_14d,
        probability_30d = EXCLUDED.probability_30d,
        expected_time_to_risk_days = EXCLUDED.expected_time_to_risk_days,
        confidence = EXCLUDED.confidence,
        top_drivers = EXCLUDED.top_drivers,
        similar_cases = EXCLUDED.similar_cases,
        evidence_refs = EXCLUDED.evidence_refs,
        publishable = EXCLUDED.publishable,
        generated_at = EXCLUDED.generated_at,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function refreshRiskForecasts(pool, scope, options = {}) {
  const run = await startProcessRun(pool, scope, "forecast_refresh", {
    source: "system",
    payload: {
      project_id: options.project_id || scope.projectId,
      window_days: options.window_days || 14,
      top_k: options.top_k || 5,
    },
  });
  try {
  const [signals, scores, similarCases] = await Promise.all([
    fetchSignals(pool, scope),
    fetchScores(pool, scope),
    findSimilarCases(pool, scope, {
      project_id: options.project_id || scope.projectId,
      window_days: options.window_days || 14,
      top_k: options.top_k || 5,
    }),
  ]);
  const forecasts = computeRiskForecastsFromInputs({
    signals,
    scores,
    similarCases,
    now: options.now || new Date(),
  });
  const touched = await upsertForecasts(pool, scope, forecasts);
  const unpublished = forecasts.filter((item) => !item.publishable);
  if (unpublished.length > 0) {
    await warnProcess(pool, scope, "forecast_refresh", "Some forecasts have no evidence and are hidden", {
      payload: {
        unpublished_risk_types: unpublished.map((item) => item.risk_type),
      },
    });
  }
  const result = {
    touched,
    forecasts,
    similar_cases_top3: similarCases.slice(0, 3),
  };
  await finishProcessRun(pool, scope, run, {
    counters: {
      signals: signals.length,
      scores: scores.length,
      similar_cases: similarCases.length,
      forecasts: forecasts.length,
      publishable_forecasts: forecasts.length - unpublished.length,
      unpublished_forecasts: unpublished.length,
    },
    payload: {
      touched,
    },
  });
  return result;
  } catch (error) {
    await failProcessRun(pool, scope, run, error, {});
    throw error;
  }
}

export async function listRiskForecasts(pool, scope, options = {}) {
  const includeUnpublished = String(options.include_unpublished || "").trim().toLowerCase() === "true";
  const { rows } = await pool.query(
    `
      SELECT
        risk_type,
        probability_7d,
        probability_14d,
        probability_30d,
        expected_time_to_risk_days,
        confidence,
        top_drivers,
        similar_cases,
        evidence_refs,
        publishable,
        generated_at,
        updated_at
      FROM kag_risk_forecasts
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3::boolean = true OR publishable = true)
      ORDER BY risk_type ASC
    `,
    [scope.projectId, scope.accountScopeId, includeUnpublished]
  );
  return rows;
}
