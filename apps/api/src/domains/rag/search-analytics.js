/**
 * @module search-analytics
 * @description Search analytics tracking and reporting (Iter 45.5).
 *
 * - Tracks search queries, result counts, click-through rates
 * - Stores in search_analytics table
 * - Provides summary endpoint data for dashboard
 */

/**
 * @param {string} value
 * @param {number} max
 * @returns {string}
 */
function safeText(value, max = 4000) {
  const text = String(value || "").trim();
  return text.slice(0, max);
}

/**
 * Track a search analytics event (query execution or result click).
 *
 * @param {import('pg').Pool} pool
 * @param {object} scope - { projectId, accountScopeId }
 * @param {object} event
 * @param {string} event.query - The search query text
 * @param {number} [event.resultCount] - Number of results returned
 * @param {object} [event.filters] - Applied filters (source types, date range, etc.)
 * @param {string|null} [event.userId] - Authenticated user ID
 * @param {string|null} [event.clickedResultId] - ID of clicked result (for click events)
 * @param {string|null} [event.clickedSourceType] - Source type of clicked result
 * @param {string} [event.eventType] - 'search' | 'click' | 'suggestion'
 * @param {number|null} [event.durationMs] - Query execution time in ms
 * @param {object} [logger]
 * @returns {Promise<string|null>} Inserted row ID or null on failure
 */
export async function trackSearchEvent(pool, scope, event = {}, logger = console) {
  try {
    const { rows } = await pool.query(
      `
        INSERT INTO search_analytics(
          query,
          result_count,
          filters,
          user_id,
          project_id,
          account_scope_id,
          clicked_result_id,
          clicked_source_type,
          event_type,
          duration_ms,
          created_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, now())
        RETURNING id
      `,
      [
        safeText(event.query, 4000),
        Number.isFinite(event.resultCount) ? event.resultCount : 0,
        JSON.stringify(event.filters || {}),
        event.userId || null,
        scope.projectId || null,
        scope.accountScopeId || null,
        event.clickedResultId ? safeText(event.clickedResultId, 500) : null,
        event.clickedSourceType ? safeText(event.clickedSourceType, 100) : null,
        safeText(event.eventType || "search", 50),
        Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
      ]
    );
    return rows[0]?.id || null;
  } catch (error) {
    logger.warn(
      { err: String(error?.message || error) },
      "failed to track search analytics event"
    );
    return null;
  }
}

/**
 * Get search analytics summary for a project scope.
 *
 * @param {import('pg').Pool} pool
 * @param {object} scope - { projectId, accountScopeId }
 * @param {object} [options]
 * @param {number} [options.days] - Number of days to look back (default 30)
 * @param {number} [options.topQueriesLimit] - Max top queries to return (default 20)
 * @returns {Promise<object>} Analytics summary
 */
export async function getSearchAnalyticsSummary(pool, scope, options = {}) {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const topQueriesLimit = Math.max(1, Math.min(options.topQueriesLimit || 20, 100));

  const [overviewResult, topQueriesResult, dailyVolumeResult, clickRateResult, sourceBreakdownResult] = await Promise.all([
    // Overview stats
    pool.query(
      `
        SELECT
          count(*) FILTER (WHERE event_type = 'search')::int AS total_searches,
          count(*) FILTER (WHERE event_type = 'click')::int AS total_clicks,
          count(DISTINCT CASE WHEN event_type = 'search' THEN query END)::int AS unique_queries,
          count(DISTINCT user_id)::int AS unique_users,
          round(avg(duration_ms) FILTER (WHERE event_type = 'search'))::int AS avg_duration_ms,
          round(avg(result_count) FILTER (WHERE event_type = 'search'))::int AS avg_result_count
        FROM search_analytics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= now() - make_interval(days => $3)
      `,
      [scope.projectId, scope.accountScopeId, days]
    ),

    // Top queries by frequency
    pool.query(
      `
        SELECT
          query,
          count(*)::int AS search_count,
          round(avg(result_count))::int AS avg_results,
          round(avg(duration_ms))::int AS avg_duration_ms
        FROM search_analytics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND event_type = 'search'
          AND created_at >= now() - make_interval(days => $3)
        GROUP BY query
        ORDER BY search_count DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, days, topQueriesLimit]
    ),

    // Daily search volume
    pool.query(
      `
        SELECT
          date_trunc('day', created_at)::date AS day,
          count(*) FILTER (WHERE event_type = 'search')::int AS searches,
          count(*) FILTER (WHERE event_type = 'click')::int AS clicks
        FROM search_analytics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND created_at >= now() - make_interval(days => $3)
        GROUP BY date_trunc('day', created_at)
        ORDER BY day DESC
      `,
      [scope.projectId, scope.accountScopeId, days]
    ),

    // Click-through rate (queries that led to clicks)
    pool.query(
      `
        WITH search_sessions AS (
          SELECT DISTINCT query
          FROM search_analytics
          WHERE project_id = $1
            AND account_scope_id = $2
            AND event_type = 'search'
            AND created_at >= now() - make_interval(days => $3)
        ),
        clicked_queries AS (
          SELECT DISTINCT query
          FROM search_analytics
          WHERE project_id = $1
            AND account_scope_id = $2
            AND event_type = 'click'
            AND created_at >= now() - make_interval(days => $3)
        )
        SELECT
          (SELECT count(*)::int FROM search_sessions) AS total_query_types,
          (SELECT count(*)::int FROM clicked_queries) AS clicked_query_types
      `,
      [scope.projectId, scope.accountScopeId, days]
    ),

    // Clicked source type breakdown
    pool.query(
      `
        SELECT
          clicked_source_type AS source_type,
          count(*)::int AS click_count
        FROM search_analytics
        WHERE project_id = $1
          AND account_scope_id = $2
          AND event_type = 'click'
          AND clicked_source_type IS NOT NULL
          AND created_at >= now() - make_interval(days => $3)
        GROUP BY clicked_source_type
        ORDER BY click_count DESC
      `,
      [scope.projectId, scope.accountScopeId, days]
    ),
  ]);

  const overview = overviewResult.rows[0] || {};
  const clickRate = clickRateResult.rows[0] || {};
  const ctr = clickRate.total_query_types > 0
    ? Math.round((clickRate.clicked_query_types / clickRate.total_query_types) * 10000) / 100
    : 0;

  return {
    period_days: days,
    overview: {
      total_searches: overview.total_searches || 0,
      total_clicks: overview.total_clicks || 0,
      unique_queries: overview.unique_queries || 0,
      unique_users: overview.unique_users || 0,
      avg_duration_ms: overview.avg_duration_ms || 0,
      avg_result_count: overview.avg_result_count || 0,
      click_through_rate_pct: ctr,
    },
    top_queries: topQueriesResult.rows || [],
    daily_volume: dailyVolumeResult.rows || [],
    source_clicks: sourceBreakdownResult.rows || [],
  };
}


/**
 * Get autocomplete search suggestions from recent analytics queries.
 *
 * @param {import('pg').Pool} pool
 * @param {object} scope - { projectId, accountScopeId }
 * @param {object} [options]
 * @param {string} [options.query] - Prefix/substring query to match
 * @param {number} [options.limit] - Max suggestions count
 * @param {number} [options.days] - Lookback window in days
 * @returns {Promise<Array<{query: string, search_count: number}>>}
 */
export async function getSearchSuggestions(pool, scope, options = {}) {
  const queryText = safeText(options.query || "", 4000).toLowerCase();
  const limit = Math.max(1, Math.min(Number(options.limit) || 8, 20));
  const days = Math.max(1, Math.min(Number(options.days) || 30, 365));
  const pattern = queryText ? `%${queryText}%` : null;

  const { rows } = await pool.query(
    `
      SELECT
        query,
        count(*)::int AS search_count
      FROM search_analytics
      WHERE project_id = $1
        AND account_scope_id = $2
        AND event_type = 'search'
        AND btrim(COALESCE(query, '')) <> ''
        AND created_at >= now() - make_interval(days => $3)
        AND ($4::text IS NULL OR lower(query) LIKE $4::text)
      GROUP BY query
      ORDER BY search_count DESC, max(created_at) DESC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, days, pattern, limit]
  );

  return rows.map((row) => ({
    query: safeText(row.query, 4000),
    search_count: Number(row.search_count || 0),
  }));
}

