/**
 * @module search-ranking
 * @description Weighted scoring for search results (Iter 45.1).
 *
 * Composite score = semantic_similarity * W_SEM + recency * W_REC + source_authority * W_AUTH
 *
 * Default weights: semantic 0.6, recency 0.2, source authority 0.2
 * Source authority: chatwoot messages > linear issues > attio deals (configurable)
 * Recency: exponential decay with configurable half-life (default 7 days)
 */

/** @type {Record<string, number>} */
const DEFAULT_SOURCE_AUTHORITY = {
  chatwoot_message: 1.0,
  rag_chunk: 0.85,
  linear_issue: 0.7,
  attio_opportunity: 0.5,
};

const DEFAULT_WEIGHTS = {
  semantic: 0.6,
  recency: 0.2,
  authority: 0.2,
};

const DEFAULT_HALF_LIFE_DAYS = 7;

/**
 * Exponential decay function for recency scoring.
 * Returns a value between 0 and 1, where 1 = now and 0.5 = half-life ago.
 *
 * @param {Date|string|null} dateValue
 * @param {number} halfLifeDays
 * @returns {number} Recency score between 0 and 1
 */
function computeRecencyScore(dateValue, halfLifeDays = DEFAULT_HALF_LIFE_DAYS) {
  if (!dateValue) return 0;

  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;

  const nowMs = Date.now();
  const ageMs = nowMs - date.getTime();
  if (ageMs <= 0) return 1;

  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  // Exponential decay: score = 2^(-age / halfLife)
  return Math.pow(2, -(ageMs / halfLifeMs));
}

/**
 * Convert cosine distance (0 = identical, 2 = opposite) to similarity score (0–1).
 * pgvector `<=>` returns cosine distance.
 *
 * @param {number|null} distance - Cosine distance from pgvector
 * @returns {number} Similarity score 0–1
 */
function distanceToSimilarity(distance) {
  if (distance == null || !Number.isFinite(distance)) return 0;
  // Cosine distance range is [0, 2], similarity = 1 - distance/2
  // But for practical search results, distance is usually 0–1
  return Math.max(0, Math.min(1, 1 - distance));
}

/**
 * Get authority score for a source type.
 *
 * @param {string} sourceType
 * @param {Record<string, number>} [authorityWeights]
 * @returns {number} Authority score 0–1
 */
function getSourceAuthority(sourceType, authorityWeights = DEFAULT_SOURCE_AUTHORITY) {
  const key = String(sourceType || "").toLowerCase().trim();
  return authorityWeights[key] ?? 0.3;
}

/**
 * Compute weighted composite score for a single search result.
 *
 * @param {object} item - Evidence item from queryLightRag
 * @param {object} [options]
 * @param {Record<string, number>} [options.weights] - Score component weights
 * @param {Record<string, number>} [options.authorityWeights] - Per-source authority
 * @param {number} [options.halfLifeDays] - Recency decay half-life
 * @returns {{ score: number, breakdown: { semantic: number, recency: number, authority: number } }}
 */
function scoreResult(item, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const authorityWeights = { ...DEFAULT_SOURCE_AUTHORITY, ...options.authorityWeights };
  const halfLifeDays = options.halfLifeDays || DEFAULT_HALF_LIFE_DAYS;

  // Semantic similarity
  const distance = item.metadata?.distance ?? item.distance ?? null;
  const semantic = distanceToSimilarity(distance);

  // Recency
  const dateValue = item.created_at || item.updated_at || null;
  const recency = computeRecencyScore(dateValue, halfLifeDays);

  // Source authority
  const authority = getSourceAuthority(item.source_type, authorityWeights);

  // Weighted composite
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

/**
 * Rank and sort an array of evidence items by composite score.
 *
 * @param {Array<object>} evidence - Evidence array from queryLightRag
 * @param {object} [options]
 * @param {Record<string, number>} [options.weights] - Score component weights
 * @param {Record<string, number>} [options.authorityWeights] - Per-source authority
 * @param {number} [options.halfLifeDays] - Recency decay half-life
 * @param {number} [options.limit] - Max results to return
 * @returns {Array<object>} Scored, sorted results with `_score` and `_scoreBreakdown`
 */
export function rankSearchResults(evidence, options = {}) {
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

  // Sort by composite score descending
  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, limit);
}

/**
 * Compute aggregate ranking stats for a set of scored results.
 *
 * @param {Array<object>} rankedResults - Results from rankSearchResults
 * @returns {{ avgScore: number, maxScore: number, minScore: number, count: number }}
 */
export function computeRankingStats(rankedResults) {
  if (!Array.isArray(rankedResults) || !rankedResults.length) {
    return { avgScore: 0, maxScore: 0, minScore: 0, count: 0 };
  }

  const scores = rankedResults.map((r) => r._score || 0);
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
