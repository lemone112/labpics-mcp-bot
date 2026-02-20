-- =============================================================================
-- Migration 0032: Search Analytics (Iter 45)
-- =============================================================================
-- Tasks: 45.5 search analytics tracking, 45.6 search_analytics table
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 45.6: search_analytics table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS search_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid,
  clicked_result_id text,
  clicked_source_type text,
  event_type text NOT NULL DEFAULT 'search',
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index on created_at for time-range queries and analytics aggregation
CREATE INDEX IF NOT EXISTS search_analytics_created_at_idx
  ON search_analytics (created_at DESC);

-- Index on user_id for per-user search history
CREATE INDEX IF NOT EXISTS search_analytics_user_id_idx
  ON search_analytics (user_id) WHERE user_id IS NOT NULL;

-- Index on project_id for project-scoped analytics
CREATE INDEX IF NOT EXISTS search_analytics_project_id_idx
  ON search_analytics (project_id) WHERE project_id IS NOT NULL;

-- Index on event_type for filtering searches vs clicks
CREATE INDEX IF NOT EXISTS search_analytics_event_type_idx
  ON search_analytics (event_type);
