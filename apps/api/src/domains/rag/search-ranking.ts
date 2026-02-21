/**
 * Weighted scoring for search results (Iter 45.1).
 */

type SourceAuthorityMap = Record<string, number>;

type RankingWeights = {
  semantic: number;
  recency: number;
  authority: number;
};

type ScoredResult = {
  _score: number;
  _scoreBreakdown: {
    semantic: number;
    recency: number;
    authority: number;
  };
};

const DEFAULT_SOURCE_AUTHORITY: SourceAuthorityMap = {
  chatwoot_message: 1.0,
  rag_chunk: 0.85,
  linear_issue: 0.7,
  attio_opportunity: 0.5,
};

const DEFAULT_WEIGHTS: RankingWeights = {
  semantic: 0.6,
  recency: 0.2,
  authority: 0.2,
};

const DEFAULT_HALF_LIFE_DAYS = 7;

function computeRecencyScore(dateValue: Date | string | null, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
  if (!dateValue) return 0;

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - date.getTime();
  if (ageMs <= 0) return 1;

  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  return Math.pow(2, -(ageMs / halfLifeMs));
}

function distanceToSimilarity(distance: number | null) {
  if (distance == null || !Number.isFinite(distance)) return 0;
  return Math.max(0, Math.min(1, 1 - distance));
}

function getSourceAuthority(sourceType: string, authorityWeights: SourceAuthorityMap = DEFAULT_SOURCE_AUTHORITY) {
  const key = String(sourceType || "").toLowerCase().trim();
  return authorityWeights[key] ?? 0.3;
}

function scoreResult(
  item: Record<string, any>,
  options: {
    weights?: Partial<RankingWeights>;
    authorityWeights?: SourceAuthorityMap;
    halfLifeDays?: number;
  } = {}
) {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const authorityWeights = { ...DEFAULT_SOURCE_AUTHORITY, ...options.authorityWeights };
  const halfLifeDays = options.halfLifeDays || DEFAULT_HALF_LIFE_DAYS;

  const distance = item.metadata?.distance ?? item.distance ?? null;
  const semantic = distanceToSimilarity(distance);
  const dateValue = item.created_at || item.updated_at || null;
  const recency = computeRecencyScore(dateValue, halfLifeDays);
  const authority = getSourceAuthority(item.source_type, authorityWeights);
  const score = semantic * weights.semantic + recency * weights.recency + authority * weights.authority;

  return {
    score: Math.round(score * 10000) / 10000,
    breakdown: {
      semantic: Math.round(semantic * 10000) / 10000,
      recency: Math.round(recency * 10000) / 10000,
      authority: Math.round(authority * 10000) / 10000,
    },
  };
}

export function rankSearchResults(
  evidence: Array<Record<string, any>>,
  options: {
    weights?: Partial<RankingWeights>;
    authorityWeights?: SourceAuthorityMap;
    halfLifeDays?: number;
    limit?: number;
  } = {}
) {
  if (!Array.isArray(evidence) || !evidence.length) return [];

  const limit = options.limit || evidence.length;

  const scored = evidence.map((item) => {
    const { score, breakdown } = scoreResult(item, options);
    return {
      ...item,
      _score: score,
      _scoreBreakdown: breakdown,
    };
  });

  scored.sort((a, b) => (b as ScoredResult)._score - (a as ScoredResult)._score);

  return scored.slice(0, limit);
}

export function computeRankingStats(rankedResults: Array<Record<string, any>>) {
  if (!Array.isArray(rankedResults) || !rankedResults.length) {
    return { avgScore: 0, maxScore: 0, minScore: 0, count: 0 };
  }

  const scores = rankedResults.map((r) => Number((r as ScoredResult)._score || 0));
  const sum = scores.reduce((acc, s) => acc + s, 0);

  return {
    avgScore: Math.round((sum / scores.length) * 10000) / 10000,
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    count: scores.length,
  };
}

export {
  DEFAULT_SOURCE_AUTHORITY,
  DEFAULT_WEIGHTS,
  DEFAULT_HALF_LIFE_DAYS,
  computeRecencyScore,
  distanceToSimilarity,
  getSourceAuthority,
  scoreResult,
};
