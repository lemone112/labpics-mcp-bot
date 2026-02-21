-- =============================================================================
-- Migration 0041: Extensible metrics layer (Iter 66.1)
-- =============================================================================
-- Adds universal metric catalog + dimensions + observations + rollups.
-- Key guarantees:
--   - metric versioning with single "current" version per metric_key
--   - idempotent ingest by (metric, subject, timestamp, dimensions hash)
--   - scope-safe writes via enforce_project_scope_match()
--   - subject integrity checks (project/employee/crm entities)
--   - dimension contract validation (required/allowed keys)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION metric_dimensions_hash(input jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(convert_to(COALESCE(input, '{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- Metric catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  description text,
  unit text,
  value_type text NOT NULL,
  aggregation_type text NOT NULL,
  source text,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metric_definitions_key_not_blank CHECK (btrim(metric_key) <> ''),
  CONSTRAINT metric_definitions_version_positive CHECK (version >= 1),
  CONSTRAINT metric_definitions_value_type_check CHECK (
    value_type IN ('numeric', 'text', 'boolean', 'json')
  ),
  CONSTRAINT metric_definitions_aggregation_type_check CHECK (
    aggregation_type IN (
      'sum',
      'avg',
      'count',
      'last',
      'max',
      'min',
      'ratio',
      'distinct_count'
    )
  ),
  CONSTRAINT metric_definitions_key_version_unique UNIQUE (metric_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS metric_definitions_current_key_unique_idx
  ON metric_definitions (metric_key)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS metric_definitions_enabled_idx
  ON metric_definitions (enabled, metric_key);

CREATE OR REPLACE FUNCTION enforce_metric_definition_current_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE metric_definitions
    SET is_current = false,
        updated_at = now()
    WHERE metric_key = NEW.metric_key
      AND id IS DISTINCT FROM NEW.id
      AND is_current = true;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_definitions')
      AND tgname = 'metric_definitions_current_guard'
  ) THEN
    CREATE TRIGGER metric_definitions_current_guard
    BEFORE INSERT OR UPDATE ON metric_definitions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_metric_definition_current_version();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_definitions')
      AND tgname = 'metric_definitions_set_updated_at'
  ) THEN
    CREATE TRIGGER metric_definitions_set_updated_at
    BEFORE UPDATE ON metric_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Metric dimensions contract
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_dimensions (
  id bigserial PRIMARY KEY,
  metric_id uuid NOT NULL REFERENCES metric_definitions(id) ON DELETE CASCADE,
  dimension_key text NOT NULL,
  dimension_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  allowed_values jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metric_dimensions_key_not_blank CHECK (btrim(dimension_key) <> ''),
  CONSTRAINT metric_dimensions_type_check CHECK (
    dimension_type IN ('text', 'number', 'boolean', 'date', 'timestamp', 'enum', 'json')
  ),
  CONSTRAINT metric_dimensions_enum_values_check CHECK (
    dimension_type <> 'enum'
    OR (
      allowed_values IS NOT NULL
      AND jsonb_typeof(allowed_values) = 'array'
      AND jsonb_array_length(allowed_values) > 0
    )
  ),
  CONSTRAINT metric_dimensions_metric_key_unique UNIQUE (metric_id, dimension_key)
);

CREATE INDEX IF NOT EXISTS metric_dimensions_metric_idx
  ON metric_dimensions (metric_id, required DESC, dimension_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_dimensions')
      AND tgname = 'metric_dimensions_set_updated_at'
  ) THEN
    CREATE TRIGGER metric_dimensions_set_updated_at
    BEFORE UPDATE ON metric_dimensions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Metric observations (fact table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_observations (
  id bigserial PRIMARY KEY,
  metric_id uuid NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  value_numeric numeric(18,6),
  value_text text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimension_hash text GENERATED ALWAYS AS (metric_dimensions_hash(dimensions)) STORED,
  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  source_event_id text,
  is_backfill boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metric_observations_subject_type_check CHECK (
    subject_type IN ('project', 'employee', 'crm_account', 'crm_opportunity', 'system')
  ),
  CONSTRAINT metric_observations_source_event_not_blank CHECK (
    source_event_id IS NULL OR btrim(source_event_id) <> ''
  )
);

-- Idempotent ingest key
CREATE UNIQUE INDEX IF NOT EXISTS metric_observations_ingest_idempotency_idx
  ON metric_observations (
    metric_id,
    project_id,
    account_scope_id,
    subject_type,
    subject_id,
    observed_at,
    dimension_hash
  );

CREATE INDEX IF NOT EXISTS metric_observations_project_metric_observed_idx
  ON metric_observations (project_id, metric_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS metric_observations_scope_metric_observed_idx
  ON metric_observations (account_scope_id, metric_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS metric_observations_subject_metric_observed_idx
  ON metric_observations (subject_type, subject_id, metric_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS metric_observations_dimensions_gin_idx
  ON metric_observations USING gin (dimensions jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Optional rollup storage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_rollups (
  id bigserial PRIMARY KEY,
  metric_id uuid NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  bucket_granularity text NOT NULL,
  bucket_start timestamptz NOT NULL,
  bucket_end timestamptz NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimension_hash text GENERATED ALWAYS AS (metric_dimensions_hash(dimensions)) STORED,
  value_numeric numeric(18,6),
  value_text text,
  sample_count int NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  last_observed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metric_rollups_subject_type_check CHECK (
    subject_type IN ('project', 'employee', 'crm_account', 'crm_opportunity', 'system')
  ),
  CONSTRAINT metric_rollups_bucket_granularity_check CHECK (
    bucket_granularity IN ('hour', 'day', 'week', 'month')
  ),
  CONSTRAINT metric_rollups_bucket_window_check CHECK (bucket_end > bucket_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS metric_rollups_dedup_unique_idx
  ON metric_rollups (
    metric_id,
    project_id,
    account_scope_id,
    subject_type,
    subject_id,
    bucket_granularity,
    bucket_start,
    dimension_hash
  );

CREATE INDEX IF NOT EXISTS metric_rollups_scope_metric_bucket_idx
  ON metric_rollups (account_scope_id, metric_id, bucket_granularity, bucket_start DESC);

CREATE INDEX IF NOT EXISTS metric_rollups_subject_metric_bucket_idx
  ON metric_rollups (subject_type, subject_id, metric_id, bucket_start DESC);

-- ---------------------------------------------------------------------------
-- Validation and scope functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_metric_subject_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  employee_scope_id uuid;
  account_scope_id_ref uuid;
  account_project_id_ref uuid;
  opp_scope_id_ref uuid;
  opp_project_id_ref uuid;
BEGIN
  IF NEW.subject_type IN ('project', 'system') THEN
    IF NEW.subject_id IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'subject_id must equal project_id for subject_type %. expected %, got %',
        NEW.subject_type, NEW.project_id, NEW.subject_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.subject_type = 'employee' THEN
    SELECT e.account_scope_id
    INTO employee_scope_id
    FROM employees AS e
    WHERE e.id = NEW.subject_id
    LIMIT 1;

    IF employee_scope_id IS NULL THEN
      RAISE EXCEPTION 'employee subject % not found', NEW.subject_id;
    END IF;

    IF employee_scope_id IS DISTINCT FROM NEW.account_scope_id THEN
      RAISE EXCEPTION
        'employee scope mismatch. expected %, got %',
        employee_scope_id, NEW.account_scope_id;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.subject_type = 'crm_account' THEN
    SELECT a.account_scope_id, a.project_id
    INTO account_scope_id_ref, account_project_id_ref
    FROM crm_accounts AS a
    WHERE a.id = NEW.subject_id
    LIMIT 1;

    IF account_scope_id_ref IS NULL THEN
      RAISE EXCEPTION 'crm_account subject % not found', NEW.subject_id;
    END IF;

    IF account_scope_id_ref IS DISTINCT FROM NEW.account_scope_id
       OR account_project_id_ref IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'crm_account scope/project mismatch. expected (%, %), got (%, %)',
        account_project_id_ref, account_scope_id_ref, NEW.project_id, NEW.account_scope_id;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.subject_type = 'crm_opportunity' THEN
    SELECT o.account_scope_id, o.project_id
    INTO opp_scope_id_ref, opp_project_id_ref
    FROM crm_opportunities AS o
    WHERE o.id = NEW.subject_id
    LIMIT 1;

    IF opp_scope_id_ref IS NULL THEN
      RAISE EXCEPTION 'crm_opportunity subject % not found', NEW.subject_id;
    END IF;

    IF opp_scope_id_ref IS DISTINCT FROM NEW.account_scope_id
       OR opp_project_id_ref IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'crm_opportunity scope/project mismatch. expected (%, %), got (%, %)',
        opp_project_id_ref, opp_scope_id_ref, NEW.project_id, NEW.account_scope_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_metric_observation_value_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  metric_value_type text;
BEGIN
  SELECT d.value_type
  INTO metric_value_type
  FROM metric_definitions AS d
  WHERE d.id = NEW.metric_id
  LIMIT 1;

  IF metric_value_type IS NULL THEN
    RAISE EXCEPTION 'metric definition % not found', NEW.metric_id;
  END IF;

  IF metric_value_type = 'numeric' THEN
    IF NEW.value_numeric IS NULL OR NEW.value_text IS NOT NULL THEN
      RAISE EXCEPTION 'numeric metric requires value_numeric and forbids value_text';
    END IF;
  ELSIF metric_value_type = 'text' THEN
    IF NEW.value_text IS NULL OR NEW.value_numeric IS NOT NULL THEN
      RAISE EXCEPTION 'text metric requires value_text and forbids value_numeric';
    END IF;
  ELSIF metric_value_type = 'boolean' THEN
    IF NEW.value_text IS NULL OR NEW.value_numeric IS NOT NULL THEN
      RAISE EXCEPTION 'boolean metric requires value_text and forbids value_numeric';
    END IF;
    IF lower(NEW.value_text) NOT IN ('true', 'false', '1', '0', 'yes', 'no') THEN
      RAISE EXCEPTION 'boolean metric value_text must be boolean-like';
    END IF;
  ELSIF metric_value_type = 'json' THEN
    IF NEW.value_text IS NULL OR btrim(NEW.value_text) = '' THEN
      RAISE EXCEPTION 'json metric requires value_text payload';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_metric_observation_dimensions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dim_key text;
  dim_row record;
  dimensions_obj jsonb;
BEGIN
  dimensions_obj := COALESCE(NEW.dimensions, '{}'::jsonb);

  FOR dim_key IN
    SELECT jsonb_object_keys(dimensions_obj)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM metric_dimensions AS d
      WHERE d.metric_id = NEW.metric_id
        AND d.dimension_key = dim_key
    ) THEN
      RAISE EXCEPTION 'unknown dimension key "%" for metric %', dim_key, NEW.metric_id;
    END IF;
  END LOOP;

  FOR dim_row IN
    SELECT d.dimension_key, d.required, d.dimension_type, d.allowed_values
    FROM metric_dimensions AS d
    WHERE d.metric_id = NEW.metric_id
  LOOP
    IF dim_row.required AND NOT (dimensions_obj ? dim_row.dimension_key) THEN
      RAISE EXCEPTION 'missing required dimension key "%" for metric %', dim_row.dimension_key, NEW.metric_id;
    END IF;

    IF dim_row.dimension_type = 'enum'
       AND dimensions_obj ? dim_row.dimension_key
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(dim_row.allowed_values) AS enum_value(value)
         WHERE enum_value.value = dimensions_obj ->> dim_row.dimension_key
       ) THEN
      RAISE EXCEPTION
        'invalid enum dimension value "%" for key "%"',
        dimensions_obj ->> dim_row.dimension_key,
        dim_row.dimension_key;
    END IF;
  END LOOP;

  NEW.dimensions = dimensions_obj;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers for scope/value/dimension integrity
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_observations')
      AND tgname = 'metric_observations_scope_guard'
  ) THEN
    CREATE TRIGGER metric_observations_scope_guard
    BEFORE INSERT OR UPDATE ON metric_observations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_observations')
      AND tgname = 'metric_observations_subject_guard'
  ) THEN
    CREATE TRIGGER metric_observations_subject_guard
    BEFORE INSERT OR UPDATE ON metric_observations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_metric_subject_scope();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_observations')
      AND tgname = 'metric_observations_value_guard'
  ) THEN
    CREATE TRIGGER metric_observations_value_guard
    BEFORE INSERT OR UPDATE ON metric_observations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_metric_observation_value_shape();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_observations')
      AND tgname = 'metric_observations_dimensions_guard'
  ) THEN
    CREATE TRIGGER metric_observations_dimensions_guard
    BEFORE INSERT OR UPDATE ON metric_observations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_metric_observation_dimensions();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_observations')
      AND tgname = 'metric_observations_set_updated_at'
  ) THEN
    CREATE TRIGGER metric_observations_set_updated_at
    BEFORE UPDATE ON metric_observations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_rollups')
      AND tgname = 'metric_rollups_scope_guard'
  ) THEN
    CREATE TRIGGER metric_rollups_scope_guard
    BEFORE INSERT OR UPDATE ON metric_rollups
    FOR EACH ROW
    EXECUTE FUNCTION enforce_project_scope_match();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_rollups')
      AND tgname = 'metric_rollups_subject_guard'
  ) THEN
    CREATE TRIGGER metric_rollups_subject_guard
    BEFORE INSERT OR UPDATE ON metric_rollups
    FOR EACH ROW
    EXECUTE FUNCTION enforce_metric_subject_scope();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = to_regclass('metric_rollups')
      AND tgname = 'metric_rollups_set_updated_at'
  ) THEN
    CREATE TRIGGER metric_rollups_set_updated_at
    BEFORE UPDATE ON metric_rollups
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- KPI bridge: register baseline revenue metrics and backfill observations
-- ---------------------------------------------------------------------------
INSERT INTO metric_definitions(
  metric_key,
  version,
  is_current,
  name,
  description,
  unit,
  value_type,
  aggregation_type,
  source,
  enabled,
  metadata
)
VALUES
  (
    'revenue.pipeline_amount',
    1,
    true,
    'Pipeline amount',
    'Pipeline amount from analytics_revenue_snapshots',
    'USD',
    'numeric',
    'sum',
    'analytics_revenue_snapshots',
    true,
    '{"bridge":"legacy_kpi"}'::jsonb
  ),
  (
    'revenue.expected_revenue',
    1,
    true,
    'Expected revenue',
    'Expected revenue from analytics_revenue_snapshots',
    'USD',
    'numeric',
    'sum',
    'analytics_revenue_snapshots',
    true,
    '{"bridge":"legacy_kpi"}'::jsonb
  ),
  (
    'revenue.gross_margin',
    1,
    true,
    'Gross margin',
    'Gross margin from analytics_revenue_snapshots',
    'USD',
    'numeric',
    'sum',
    'analytics_revenue_snapshots',
    true,
    '{"bridge":"legacy_kpi"}'::jsonb
  )
ON CONFLICT (metric_key, version) DO NOTHING;

INSERT INTO metric_dimensions(metric_id, dimension_key, dimension_type, required, allowed_values, metadata)
SELECT d.id, dim.dimension_key, dim.dimension_type, dim.required, dim.allowed_values, dim.metadata
FROM metric_definitions AS d
CROSS JOIN (
  VALUES
    ('horizon_days', 'number', true, NULL::jsonb, '{"bridge":"legacy_kpi"}'::jsonb),
    ('period_start', 'date', true, NULL::jsonb, '{"bridge":"legacy_kpi"}'::jsonb)
) AS dim(dimension_key, dimension_type, required, allowed_values, metadata)
WHERE d.metric_key IN ('revenue.pipeline_amount', 'revenue.expected_revenue', 'revenue.gross_margin')
  AND d.version = 1
ON CONFLICT (metric_id, dimension_key) DO NOTHING;

WITH source_rows AS (
  SELECT
    a.project_id,
    a.account_scope_id,
    a.period_start,
    a.horizon_days,
    a.generated_at,
    a.pipeline_amount,
    a.expected_revenue,
    a.gross_margin
  FROM analytics_revenue_snapshots AS a
),
expanded AS (
  SELECT
    s.project_id,
    s.account_scope_id,
    s.period_start,
    s.horizon_days,
    s.generated_at,
    'revenue.pipeline_amount'::text AS metric_key,
    s.pipeline_amount AS metric_value
  FROM source_rows AS s
  UNION ALL
  SELECT
    s.project_id,
    s.account_scope_id,
    s.period_start,
    s.horizon_days,
    s.generated_at,
    'revenue.expected_revenue'::text AS metric_key,
    s.expected_revenue AS metric_value
  FROM source_rows AS s
  UNION ALL
  SELECT
    s.project_id,
    s.account_scope_id,
    s.period_start,
    s.horizon_days,
    s.generated_at,
    'revenue.gross_margin'::text AS metric_key,
    s.gross_margin AS metric_value
  FROM source_rows AS s
)
INSERT INTO metric_observations(
  metric_id,
  project_id,
  account_scope_id,
  subject_type,
  subject_id,
  observed_at,
  value_numeric,
  dimensions,
  quality_flags,
  source,
  source_event_id,
  is_backfill
)
SELECT
  d.id,
  e.project_id,
  e.account_scope_id,
  'project',
  e.project_id,
  e.generated_at,
  e.metric_value,
  jsonb_build_object(
    'horizon_days', e.horizon_days,
    'period_start', e.period_start::text
  ),
  '{"bridge":"legacy_kpi"}'::jsonb,
  'analytics_revenue_snapshots',
  concat('ars:', e.project_id::text, ':', e.period_start::text, ':', e.horizon_days::text, ':', d.metric_key),
  true
FROM expanded AS e
INNER JOIN metric_definitions AS d
  ON d.metric_key = e.metric_key
 AND d.version = 1
ON CONFLICT (
  metric_id,
  project_id,
  account_scope_id,
  subject_type,
  subject_id,
  observed_at,
  dimension_hash
) DO NOTHING;
