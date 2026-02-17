ALTER TABLE crm_accounts
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_accounts_source_system_check'
  ) THEN
    ALTER TABLE crm_accounts DROP CONSTRAINT crm_accounts_source_system_check;
  END IF;
END $$;

ALTER TABLE crm_accounts
  ADD CONSTRAINT crm_accounts_source_system_check
  CHECK (source_system IN ('manual', 'attio', 'linear', 'chatwoot', 'system'));

ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_opportunities_source_system_check'
  ) THEN
    ALTER TABLE crm_opportunities DROP CONSTRAINT crm_opportunities_source_system_check;
  END IF;
END $$;

ALTER TABLE crm_opportunities
  ADD CONSTRAINT crm_opportunities_source_system_check
  CHECK (source_system IN ('manual', 'attio', 'linear', 'chatwoot', 'system'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'crm_accounts'
      AND column_name = 'external_ref'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE crm_account_contacts AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE crm_opportunities AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE signals AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE next_best_actions AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE offers AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE risk_radar_items AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE health_scores AS t
    SET account_id = d.keep_id
    FROM duplicates AS d
    WHERE t.account_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_accounts
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id
      FROM ranked
      WHERE rn > 1
    )
    DELETE FROM crm_accounts AS t
    USING duplicates AS d
    WHERE t.id = d.id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'crm_opportunities'
      AND column_name = 'external_ref'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE crm_opportunity_stage_events AS t
    SET opportunity_id = d.keep_id
    FROM duplicates AS d
    WHERE t.opportunity_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE signals AS t
    SET opportunity_id = d.keep_id
    FROM duplicates AS d
    WHERE t.opportunity_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE next_best_actions AS t
    SET opportunity_id = d.keep_id
    FROM duplicates AS d
    WHERE t.opportunity_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE offers AS t
    SET opportunity_id = d.keep_id
    FROM duplicates AS d
    WHERE t.opportunity_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id, keep_id
      FROM ranked
      WHERE rn > 1
        AND id <> keep_id
    )
    UPDATE risk_radar_items AS t
    SET opportunity_id = d.keep_id
    FROM duplicates AS d
    WHERE t.opportunity_id = d.id;

    WITH ranked AS (
      SELECT
        id,
        project_id,
        external_ref,
        first_value(id) OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS keep_id,
        row_number() OVER (
          PARTITION BY project_id, external_ref
          ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS rn
      FROM crm_opportunities
      WHERE external_ref IS NOT NULL
    ),
    duplicates AS (
      SELECT id
      FROM ranked
      WHERE rn > 1
    )
    DELETE FROM crm_opportunities AS t
    USING duplicates AS d
    WHERE t.id = d.id;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_accounts_project_external_ref_unique_idx
  ON crm_accounts (project_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_project_external_ref_unique_idx
  ON crm_opportunities (project_id, external_ref);

CREATE INDEX IF NOT EXISTS crm_accounts_project_source_updated_idx
  ON crm_accounts (project_id, source_system, updated_at DESC);

CREATE INDEX IF NOT EXISTS crm_opportunities_project_source_stage_idx
  ON crm_opportunities (project_id, source_system, stage, expected_close_date);
