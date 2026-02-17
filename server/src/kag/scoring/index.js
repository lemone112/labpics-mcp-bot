import { SIGNAL_KEYS, mapSignalsByKey } from "../signals/index.js";
import { clamp, round } from '../../lib/utils.js';

const SCORE_TYPES = Object.freeze({
  PROJECT_HEALTH: "project_health",
  RISK: "risk",
  CLIENT_VALUE: "client_value",
  UPSELL_LIKELIHOOD: "upsell_likelihood",
});

function countRecentTimestamps(items = [], now = new Date(), days = 7) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  let count = 0;
  for (const item of items) {
    const ts = new Date(item);
    if (Number.isFinite(ts.getTime()) && ts >= cutoff) count += 1;
  }
  return count;
}

function normalizeRiskInputs(signalMap) {
  const waitingDays = Number(signalMap[SIGNAL_KEYS.WAITING_ON_CLIENT_DAYS]?.value || 0);
  const responseMins = Number(signalMap[SIGNAL_KEYS.RESPONSE_TIME_AVG]?.value || 0);
  const blockersAgeDays = Number(signalMap[SIGNAL_KEYS.BLOCKERS_AGE]?.value || 0);
  const stageOverdueDays = Number(signalMap[SIGNAL_KEYS.STAGE_OVERDUE]?.value || 0);
  const agreementOverdueCount = Number(signalMap[SIGNAL_KEYS.AGREEMENT_OVERDUE_COUNT]?.value || 0);
  const sentimentTrend = Number(signalMap[SIGNAL_KEYS.SENTIMENT_TREND]?.value || 0);
  const scopeCreepRate = Number(signalMap[SIGNAL_KEYS.SCOPE_CREEP_RATE]?.value || 0);
  const budgetBurnRate = Number(signalMap[SIGNAL_KEYS.BUDGET_BURN_RATE]?.value || 0);
  const marginRisk = Number(signalMap[SIGNAL_KEYS.MARGIN_RISK]?.value || 0);
  const activityDrop = Number(signalMap[SIGNAL_KEYS.ACTIVITY_DROP]?.value || 0);

  return {
    waiting: clamp((waitingDays / 6) * 100, 0, 100),
    response: clamp((responseMins / 720) * 100, 0, 100),
    blockers: clamp((blockersAgeDays / 7) * 100, 0, 100),
    stage: clamp((stageOverdueDays / 5) * 100, 0, 100),
    agreement: clamp(agreementOverdueCount * 40, 0, 100),
    sentiment: sentimentTrend >= 0 ? 0 : clamp(Math.abs(sentimentTrend) * 300, 0, 100),
    scope: clamp(scopeCreepRate * 250, 0, 100),
    budget: budgetBurnRate <= 1 ? 0 : clamp((budgetBurnRate - 1) * 500, 0, 100),
    margin: clamp(marginRisk * 100, 0, 100),
    activity: clamp(activityDrop * 100, 0, 100),
  };
}

function weightedAverage(components, weights) {
  let totalWeight = 0;
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = Number(components[key] || 0);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    totalWeight += weight;
    total += value * weight;
  }
  if (totalWeight <= 0) return 0;
  return total / totalWeight;
}

function scoreLevel(scoreType, scoreValue) {
  const score = Number(scoreValue);
  if (!Number.isFinite(score)) return "low";

  if (scoreType === SCORE_TYPES.PROJECT_HEALTH) {
    if (score < 40) return "critical";
    if (score < 60) return "high";
    if (score < 75) return "medium";
    return "low";
  }
  if (scoreType === SCORE_TYPES.RISK) {
    if (score >= 80) return "critical";
    if (score >= 65) return "high";
    if (score >= 45) return "medium";
    return "low";
  }
  if (scoreType === SCORE_TYPES.CLIENT_VALUE) {
    if (score >= 80) return "high";
    if (score >= 60) return "medium";
    if (score < 25) return "critical";
    return "low";
  }
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function collectEvidenceRefs(signals = [], max = 40) {
  const out = [];
  const seen = new Set();
  for (const signal of signals) {
    for (const ref of signal?.evidence_refs || []) {
      const key = JSON.stringify(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function computeScores({ signals = [], state = {}, now = new Date() }) {
  const signalMap = mapSignalsByKey(signals);
  const risks = normalizeRiskInputs(signalMap);

  const projectHealthWeights = {
    waiting: 0.1,
    response: 0.08,
    blockers: 0.15,
    stage: 0.15,
    agreement: 0.1,
    sentiment: 0.08,
    scope: 0.1,
    budget: 0.1,
    margin: 0.08,
    activity: 0.06,
  };
  const projectRiskPressure = weightedAverage(risks, projectHealthWeights);
  const projectHealthScore = clamp(100 - projectRiskPressure, 0, 100);

  const riskWeights = {
    blockers: 0.18,
    stage: 0.18,
    budget: 0.16,
    margin: 0.16,
    scope: 0.1,
    agreement: 0.08,
    waiting: 0.06,
    response: 0.04,
    sentiment: 0.02,
    activity: 0.02,
  };
  const riskScore = clamp(weightedAverage(risks, riskWeights), 0, 100);

  const revenue = Number(state?.finance?.revenue || 0);
  const revenueScore = clamp((revenue / 100000) * 100, 0, 100);
  const marginScore = clamp(100 - risks.margin, 0, 100);
  const engagementScore = clamp(100 - risks.activity, 0, 100);
  const sentimentEwma = Number(state?.sentiment?.ewma || 0);
  const sentimentScore = clamp((sentimentEwma + 1) * 50, 0, 100);
  const stabilityScore = clamp(projectHealthScore, 0, 100);

  const clientValueWeights = {
    revenue: 0.3,
    margin: 0.25,
    engagement: 0.2,
    sentiment: 0.1,
    stability: 0.15,
  };
  const clientValueComponents = {
    revenue: revenueScore,
    margin: marginScore,
    engagement: engagementScore,
    sentiment: sentimentScore,
    stability: stabilityScore,
  };
  const clientValueScore = clamp(weightedAverage(clientValueComponents, clientValueWeights), 0, 100);

  const needsCount7d = countRecentTimestamps(state?.needs?.events || [], now, 7);
  const scopeRequests7d = countRecentTimestamps(state?.scope?.requests || [], now, 7);
  const needSignalScore = clamp(needsCount7d * 35 + scopeRequests7d * 12, 0, 100);
  const commercialStabilityScore = clamp((100 - riskScore) * 0.6 + projectHealthScore * 0.4, 0, 100);
  const upsellComponents = {
    client_value: clientValueScore,
    need_signal: needSignalScore,
    commercial_stability: commercialStabilityScore,
  };
  const upsellWeights = {
    client_value: 0.4,
    need_signal: 0.35,
    commercial_stability: 0.25,
  };
  const upsellLikelihoodScore = clamp(weightedAverage(upsellComponents, upsellWeights), 0, 100);

  const evidenceRefs = collectEvidenceRefs(signals, 60);

  const scores = [
    {
      score_type: SCORE_TYPES.PROJECT_HEALTH,
      score: round(projectHealthScore, 2),
      level: scoreLevel(SCORE_TYPES.PROJECT_HEALTH, projectHealthScore),
      weights: projectHealthWeights,
      thresholds: { warning_below: 70, critical_below: 50 },
      factors: Object.entries(risks).map(([key, value]) => ({
        key,
        risk_contribution: round(value, 2),
      })),
      evidence_refs: evidenceRefs,
      computed_at: new Date(now).toISOString(),
    },
    {
      score_type: SCORE_TYPES.RISK,
      score: round(riskScore, 2),
      level: scoreLevel(SCORE_TYPES.RISK, riskScore),
      weights: riskWeights,
      thresholds: { warning_above: 60, critical_above: 75 },
      factors: Object.entries(risks).map(([key, value]) => ({
        key,
        risk_contribution: round(value, 2),
      })),
      evidence_refs: evidenceRefs,
      computed_at: new Date(now).toISOString(),
    },
    {
      score_type: SCORE_TYPES.CLIENT_VALUE,
      score: round(clientValueScore, 2),
      level: scoreLevel(SCORE_TYPES.CLIENT_VALUE, clientValueScore),
      weights: clientValueWeights,
      thresholds: { medium_above: 60, high_above: 75 },
      factors: Object.entries(clientValueComponents).map(([key, value]) => ({
        key,
        contribution: round(value, 2),
      })),
      evidence_refs: evidenceRefs,
      computed_at: new Date(now).toISOString(),
    },
    {
      score_type: SCORE_TYPES.UPSELL_LIKELIHOOD,
      score: round(upsellLikelihoodScore, 2),
      level: scoreLevel(SCORE_TYPES.UPSELL_LIKELIHOOD, upsellLikelihoodScore),
      weights: upsellWeights,
      thresholds: { medium_above: 55, high_above: 70 },
      factors: Object.entries(upsellComponents).map(([key, value]) => ({
        key,
        contribution: round(value, 2),
      })),
      evidence_refs: evidenceRefs,
      computed_at: new Date(now).toISOString(),
    },
  ];

  return {
    scores,
    score_map: scores.reduce((acc, row) => {
      acc[row.score_type] = row;
      return acc;
    }, {}),
    risk_components: risks,
  };
}

export { SCORE_TYPES };
