/**
 * @module search-analytics
 * @description Search analytics tracking and reporting (Iter 45.5).
 *
 * - Tracks search queries, result counts, click-through rates
 * - Stores in search_analytics table
 * - Provides summary endpoint data for dashboard
 */

import type { Pool } from "pg";

type SearchScope = {
  projectId: string | null | undefined;
  accountScopeId: string | null | undefined;
};

type SearchEventPayload = {
  query?: unknown;
  resultCount?: number | null;
  filters?: Record<string, unknown> | null;
  userId?: string | null;
  clickedResultId?: string | null;
  clickedSourceType?: string | null;
  eventType?: string | null;
  durationMs?: number | null;
};

type SearchSummaryOptions = {
  days?: number;
  topQueriesLimit?: number;
};

type LoggerLike = Pick<Console, "warn">;

type OverviewRow = {
  total_searches?: number | null;
  total_clicks?: number | null;
  unique_queries?: number | null;
  unique_users?: number | null;
  avg_duration_ms?: number | null;
  avg_result_count?: number | null;
};

type ClickRateRow = {
  total_query_types?: number | null;
  clicked_query_types?: number | null;
};

type QueryResultRow = Record<string, unknown>;

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value: unknown, max = 4000): string {
  const text = String(value || "").trim();
  return text.slice(0, max);
}

/**
 * Track a search analytics event (query execution or result click).
 */
export async function trackSearchEvent(
  pool: Pool,
  scope: Partial<SearchScope> | null | undefined,
  event: SearchEventPayload = {},
  logger: LoggerLike = console
): Promise<string | null> {
  const projectId = String(scope?.projectId || "").trim();
  const accountScopeId = String(scope?.accountScopeId || "").trim();
  if (!projectId || !accountScopeId) {
    logger.warn(
      { project_id: projectId || null, account_scope_id: accountScopeId || null },
      "skipping search analytics event due to missing scope"
    );
    return null;
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
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
        projectId,
        accountScopeId,
        event.clickedResultId ? safeText(event.clickedResultId, 500) : null,
        event.clickedSourceType ? safeText(event.clickedSourceType, 100) : null,
        safeText(event.eventType || "search", 50),
        Number.isFinite(event.durationMs) ? Math.round(event.durationMs as number) : null,
      ]
    );
    return rows[0]?.id || null;
  } catch (error) {
    logger.warn(
      { err: String((error as { message?: string })?.message || error) },
      "failed to track search analytics event"
    );
    return null;
  }
}

/**
 * Get search analytics summary for a project scope.
 */
export async function getSearchAnalyticsSummary(
  pool: Pool,
  scope: SearchScope,
  options: SearchSummaryOptions = {}
) {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const topQueriesLimit = Math.max(1, Math.min(options.topQueriesLimit || 20, 100));

  const [overviewResult, topQueriesResult, dailyVolumeResult, clickRateResult, sourceBreakdownResult] =
    await Promise.all([
      // Overview stats
      pool.query<OverviewRow>(
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
      pool.query<QueryResultRow>(
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
      pool.query<QueryResultRow>(
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
      pool.query<ClickRateRow>(
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
      pool.query<QueryResultRow>(
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
  const totalQueryTypes = asFiniteNumber(clickRate.total_query_types, 0);
  const clickedQueryTypes = asFiniteNumber(clickRate.clicked_query_types, 0);
  const ctr =
    totalQueryTypes > 0 ? Math.round((clickedQueryTypes / totalQueryTypes) * 10000) / 100 : 0;

  return {
    period_days: days,
    overview: {
      total_searches: asFiniteNumber(overview.total_searches, 0),
      total_clicks: asFiniteNumber(overview.total_clicks, 0),
      unique_queries: asFiniteNumber(overview.unique_queries, 0),
      unique_users: asFiniteNumber(overview.unique_users, 0),
      avg_duration_ms: asFiniteNumber(overview.avg_duration_ms, 0),
      avg_result_count: asFiniteNumber(overview.avg_result_count, 0),
      click_through_rate_pct: ctr,
    },
    top_queries: topQueriesResult.rows || [],
    daily_volume: dailyVolumeResult.rows || [],
    source_clicks: sourceBreakdownResult.rows || [],
  };
}
