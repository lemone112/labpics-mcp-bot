-- Iter 45.6: Fuzzy matching support for search (pg_trgm)

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping pg_trgm extension installation due to insufficient privileges';
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
     AND to_regclass('public.cw_messages') IS NOT NULL
  THEN
    CREATE INDEX IF NOT EXISTS idx_cw_messages_content_trgm
      ON cw_messages USING gin (content gin_trgm_ops);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
     AND to_regclass('public.linear_issues_raw') IS NOT NULL
  THEN
    CREATE INDEX IF NOT EXISTS idx_linear_issues_title_trgm
      ON linear_issues_raw USING gin (title gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_linear_issues_next_step_trgm
      ON linear_issues_raw USING gin (next_step gin_trgm_ops);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
     AND to_regclass('public.attio_opportunities_raw') IS NOT NULL
  THEN
    CREATE INDEX IF NOT EXISTS idx_attio_opportunities_title_trgm
      ON attio_opportunities_raw USING gin (title gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_attio_opportunities_next_step_trgm
      ON attio_opportunities_raw USING gin (next_step gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_attio_opportunities_stage_trgm
      ON attio_opportunities_raw USING gin (stage gin_trgm_ops);
  END IF;
END
$$;
