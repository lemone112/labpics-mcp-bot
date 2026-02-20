CREATE TABLE IF NOT EXISTS kag_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  node_type text NOT NULL CHECK (
    node_type IN (
      'project',
      'client',
      'person',
      'stage',
      'deliverable',
      'conversation',
      'message',
      'task',
      'blocker',
      'deal',
      'finance_entry',
      'agreement',
      'decision',
      'risk',
      'offer'
    )
  ),
  node_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  title text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  numeric_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_chunk_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, node_type, node_key)
);

CREATE INDEX IF NOT EXISTS kag_nodes_project_type_status_idx
  ON kag_nodes (project_id, node_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS kag_nodes_source_refs_gin_idx
  ON kag_nodes USING gin (source_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS kag_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  from_node_id uuid NOT NULL REFERENCES kag_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES kag_nodes(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (
    relation_type IN (
      'project_has_client',
      'project_has_stage',
      'project_has_deliverable',
      'project_has_task',
      'project_has_blocker',
      'project_has_deal',
      'project_has_finance_entry',
      'project_has_agreement',
      'project_has_decision',
      'project_has_risk',
      'project_has_offer',
      'project_has_conversation',
      'conversation_has_message',
      'message_authored_by_person',
      'task_blocked_by_blocker',
      'deliverable_depends_on_task',
      'deal_for_client',
      'agreement_for_deal',
      'decision_about_stage',
      'risk_impacts_deliverable',
      'offer_targets_client'
    )
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  weight numeric(7,4) NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_chunk_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, from_node_id, to_node_id, relation_type)
);

CREATE INDEX IF NOT EXISTS kag_edges_project_relation_idx
  ON kag_edges (project_id, relation_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS kag_edges_source_refs_gin_idx
  ON kag_edges USING gin (source_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS kag_events (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'message_sent',
      'decision_made',
      'agreement_created',
      'approval_approved',
      'stage_started',
      'stage_completed',
      'task_created',
      'task_blocked',
      'blocker_resolved',
      'deal_updated',
      'finance_entry_created',
      'risk_detected',
      'scope_change_requested',
      'need_detected',
      'offer_created'
    )
  ),
  event_ts timestamptz NOT NULL DEFAULT now(),
  actor_node_id uuid REFERENCES kag_nodes(id) ON DELETE SET NULL,
  subject_node_id uuid REFERENCES kag_nodes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processed', 'ignored')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  rag_chunk_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kag_events_project_type_ts_idx
  ON kag_events (project_id, event_type, event_ts DESC);

CREATE INDEX IF NOT EXISTS kag_events_project_status_id_idx
  ON kag_events (project_id, status, id ASC);

CREATE INDEX IF NOT EXISTS kag_events_source_refs_gin_idx
  ON kag_events USING gin (source_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS kag_provenance_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  object_kind text NOT NULL CHECK (
    object_kind IN ('node', 'edge', 'event', 'signal', 'score', 'recommendation')
  ),
  object_id text NOT NULL,
  source_kind text NOT NULL CHECK (
    source_kind IN ('chatwoot_message', 'linear_issue', 'attio_record', 'document', 'rag_chunk', 'manual', 'system')
  ),
  message_id text,
  linear_issue_id text,
  attio_record_id text,
  doc_url text,
  rag_chunk_id uuid REFERENCES rag_chunks(id) ON DELETE SET NULL,
  source_table text,
  source_pk text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    message_id IS NOT NULL
    OR linear_issue_id IS NOT NULL
    OR attio_record_id IS NOT NULL
    OR doc_url IS NOT NULL
    OR rag_chunk_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS kag_provenance_object_idx
  ON kag_provenance_refs (project_id, object_kind, object_id, created_at DESC);

CREATE INDEX IF NOT EXISTS kag_provenance_message_idx
  ON kag_provenance_refs (project_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kag_provenance_linear_idx
  ON kag_provenance_refs (project_id, linear_issue_id)
  WHERE linear_issue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS kag_provenance_attio_idx
  ON kag_provenance_refs (project_id, attio_record_id)
  WHERE attio_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kag_provenance_unique_idx
  ON kag_provenance_refs (
    project_id,
    object_kind,
    object_id,
    source_kind,
    COALESCE(message_id, ''),
    COALESCE(linear_issue_id, ''),
    COALESCE(attio_record_id, ''),
    COALESCE(doc_url, ''),
    COALESCE(rag_chunk_id::text, '')
  );

CREATE TABLE IF NOT EXISTS kag_signal_state (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  last_event_id bigint NOT NULL DEFAULT 0,
  state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kag_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  signal_key text NOT NULL CHECK (
    signal_key IN (
      'waiting_on_client_days',
      'response_time_avg',
      'blockers_age',
      'stage_overdue',
      'agreement_overdue_count',
      'sentiment_trend',
      'scope_creep_rate',
      'budget_burn_rate',
      'margin_risk',
      'activity_drop'
    )
  ),
  value numeric(14,4) NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'warn', 'critical')),
  threshold_warn numeric(14,4),
  threshold_critical numeric(14,4),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, signal_key)
);

CREATE INDEX IF NOT EXISTS kag_signals_project_status_idx
  ON kag_signals (project_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS kag_signal_history (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  signal_key text NOT NULL,
  value numeric(14,4) NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'warn', 'critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kag_signal_history_project_signal_idx
  ON kag_signal_history (project_id, signal_key, computed_at DESC);

CREATE TABLE IF NOT EXISTS kag_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  score_type text NOT NULL CHECK (
    score_type IN ('project_health', 'risk', 'client_value', 'upsell_likelihood')
  ),
  score numeric(6,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  level text NOT NULL CHECK (level IN ('low', 'medium', 'high', 'critical')),
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, score_type)
);

CREATE INDEX IF NOT EXISTS kag_scores_project_type_idx
  ON kag_scores (project_id, score_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS kag_score_history (
  id bigserial PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  score_type text NOT NULL,
  score numeric(6,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  level text NOT NULL CHECK (level IN ('low', 'medium', 'high', 'critical')),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kag_score_history_project_type_idx
  ON kag_score_history (project_id, score_type, computed_at DESC);

CREATE TABLE IF NOT EXISTS kag_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN (
      'waiting_on_client',
      'scope_creep_change_request',
      'delivery_risk',
      'finance_risk',
      'upsell_opportunity'
    )
  ),
  priority int NOT NULL CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'dismissed', 'done')),
  title text NOT NULL,
  rationale text NOT NULL,
  suggested_template_key text NOT NULL,
  suggested_template text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  signal_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS kag_recommendations_project_status_priority_idx
  ON kag_recommendations (project_id, status, priority DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS kag_recommendations_evidence_gin_idx
  ON kag_recommendations USING gin (evidence_refs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS kag_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_scope_id uuid NOT NULL REFERENCES account_scopes(id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  category text NOT NULL CHECK (
    category IN (
      'waiting_on_client',
      'scope_creep_change_request',
      'delivery_risk',
      'finance_risk',
      'upsell_opportunity'
    )
  ),
  language text NOT NULL DEFAULT 'ru',
  channel text NOT NULL DEFAULT 'email',
  body text NOT NULL,
  source text NOT NULL CHECK (source IN ('system', 'llm')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, template_key, language, channel, version)
);

CREATE INDEX IF NOT EXISTS kag_templates_project_key_idx
  ON kag_templates (project_id, template_key, language, channel, version DESC);

DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'kag_nodes',
    'kag_edges',
    'kag_events',
    'kag_provenance_refs',
    'kag_signal_state',
    'kag_signals',
    'kag_signal_history',
    'kag_scores',
    'kag_score_history',
    'kag_recommendations',
    'kag_templates'
  ]
  LOOP
    trg := tbl || '_scope_guard';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = to_regclass(tbl)
        AND tgname = trg
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_project_scope_match()',
        trg,
        tbl
      );
    END IF;
  END LOOP;
END $$;
