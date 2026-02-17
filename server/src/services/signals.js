import crypto from "node:crypto";

function toConfidence(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function toSeverity(value, fallback = 3) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(5, n));
}

function signalDedupeKey(projectId, signalType, sourceRef) {
  return crypto.createHash("sha1").update(`${projectId}:${signalType}:${sourceRef}`).digest("hex");
}

function nbaDedupeKey(projectId, signalId, actionType) {
  return crypto.createHash("sha1").update(`${projectId}:${signalId}:${actionType}`).digest("hex");
}

function detectMessageSignals(messageRow) {
  const content = String(messageRow.content_snippet || messageRow.content || "").toLowerCase();
  const signals = [];
  if (!content) return signals;

  if (/(delay|blocked|blocker|stuck|slipped|late)/i.test(content)) {
    signals.push({
      signal_type: "delivery_risk",
      severity: 4,
      confidence: 0.82,
      summary: "Potential delivery blocker detected in conversation",
      source_kind: "conversation",
      source_ref: messageRow.id,
      evidence_refs: [messageRow.id, messageRow.conversation_global_id].filter(Boolean),
    });
  }
  if (/(budget|pricing|discount|cost|expensive)/i.test(content)) {
    signals.push({
      signal_type: "commercial_pressure",
      severity: 3,
      confidence: 0.74,
      summary: "Budget or pricing pressure signal detected",
      source_kind: "conversation",
      source_ref: messageRow.id,
      evidence_refs: [messageRow.id, messageRow.conversation_global_id].filter(Boolean),
    });
  }
  if (/(upgrade|add-on|addon|expand|cross[- ]?sell|upsell)/i.test(content)) {
    signals.push({
      signal_type: "upsell_intent",
      severity: 2,
      confidence: 0.7,
      summary: "Potential upsell/cross-sell intent detected",
      source_kind: "conversation",
      source_ref: messageRow.id,
      evidence_refs: [messageRow.id, messageRow.conversation_global_id].filter(Boolean),
    });
  }
  if (/(urgent|asap|critical|priority)/i.test(content)) {
    signals.push({
      signal_type: "urgency_increase",
      severity: 4,
      confidence: 0.76,
      summary: "Urgency increase detected in communication",
      source_kind: "conversation",
      source_ref: messageRow.id,
      evidence_refs: [messageRow.id, messageRow.conversation_global_id].filter(Boolean),
    });
  }
  return signals;
}

function buildLinearSignals(rows) {
  return rows.map((row) => ({
    signal_type: "delivery_overdue",
    severity: toSeverity(Math.min(5, 2 + Number(row.overdue_count || 0)), 3),
    confidence: toConfidence(0.7 + Math.min(0.2, Number(row.overdue_count || 0) * 0.03), 0.75),
    summary: `Linear overdue issues: ${row.overdue_count}`,
    source_kind: "linear",
    source_ref: `linear_project:${row.linear_project_external_id || "unknown"}`,
    evidence_refs: [row.sample_issue_id].filter(Boolean),
  }));
}

function buildCrmSignals(rows) {
  return rows.map((row) => ({
    signal_type: "deal_without_next_step",
    severity: 3,
    confidence: 0.72,
    summary: `Opportunity "${row.title}" has missing/weak next step`,
    source_kind: "crm",
    source_ref: row.id,
    evidence_refs: [row.id].filter(Boolean),
  }));
}

async function upsertSignals(pool, scope, signals) {
  if (!signals.length) return { touched: 0, rows: [] };
  const payload = signals.map((signal) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    account_id: signal.account_id || null,
    opportunity_id: signal.opportunity_id || null,
    signal_type: signal.signal_type,
    severity: toSeverity(signal.severity, 3),
    confidence: toConfidence(signal.confidence, 0.5),
    summary: String(signal.summary || signal.signal_type).slice(0, 1000),
    dedupe_key: signalDedupeKey(scope.projectId, signal.signal_type, signal.source_ref || signal.summary),
    evidence_refs: signal.evidence_refs || [],
    status: signal.status || "proposed",
    source_kind: signal.source_kind || "system",
  }));

  const result = await pool.query(
    `
      INSERT INTO signals(
        project_id,
        account_scope_id,
        account_id,
        opportunity_id,
        signal_type,
        severity,
        confidence,
        summary,
        dedupe_key,
        evidence_refs,
        status,
        source_kind
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.account_id,
        x.opportunity_id,
        x.signal_type,
        x.severity,
        x.confidence,
        x.summary,
        x.dedupe_key,
        x.evidence_refs,
        x.status,
        x.source_kind
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        account_id uuid,
        opportunity_id uuid,
        signal_type text,
        severity int,
        confidence numeric,
        summary text,
        dedupe_key text,
        evidence_refs jsonb,
        status text,
        source_kind text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        severity = GREATEST(signals.severity, EXCLUDED.severity),
        confidence = GREATEST(signals.confidence, EXCLUDED.confidence),
        summary = EXCLUDED.summary,
        evidence_refs = EXCLUDED.evidence_refs,
        source_kind = EXCLUDED.source_kind
      RETURNING id, signal_type, severity, confidence, summary, dedupe_key, evidence_refs, status, source_kind, created_at
    `,
    [JSON.stringify(payload)]
  );
  return { touched: result.rowCount || 0, rows: result.rows };
}

function nbasForSignal(signal) {
  const out = [];
  if (signal.signal_type === "delivery_risk" || signal.signal_type === "delivery_overdue") {
    out.push({
      action_type: "review_delivery_blockers",
      priority: 5,
      summary: "Run delivery unblock review and assign owner",
    });
  }
  if (signal.signal_type === "commercial_pressure") {
    out.push({
      action_type: "prepare_pricing_response",
      priority: 4,
      summary: "Prepare pricing response and approval path",
    });
  }
  if (signal.signal_type === "upsell_intent") {
    out.push({
      action_type: "prepare_upsell_offer",
      priority: 4,
      summary: "Draft upsell offer and approval-ready outbound",
    });
  }
  if (signal.signal_type === "urgency_increase") {
    out.push({
      action_type: "align_priority_and_timeline",
      priority: 4,
      summary: "Align timeline and expectations with client",
    });
  }
  if (!out.length) {
    out.push({
      action_type: "triage_signal",
      priority: 3,
      summary: "Triage signal and decide next action",
    });
  }
  return out;
}

async function upsertNba(pool, scope, signalRows) {
  const payload = [];
  for (const signal of signalRows) {
    for (const candidate of nbasForSignal(signal)) {
      payload.push({
        project_id: scope.projectId,
        account_scope_id: scope.accountScopeId,
        signal_id: signal.id,
        account_id: signal.account_id || null,
        opportunity_id: signal.opportunity_id || null,
        action_type: candidate.action_type,
        priority: candidate.priority,
        status: "proposed",
        summary: candidate.summary,
        evidence_refs: signal.evidence_refs || [],
        dedupe_key: nbaDedupeKey(scope.projectId, signal.id, candidate.action_type),
      });
    }
  }
  if (!payload.length) return 0;
  const result = await pool.query(
    `
      INSERT INTO next_best_actions(
        project_id,
        account_scope_id,
        signal_id,
        account_id,
        opportunity_id,
        action_type,
        priority,
        status,
        summary,
        evidence_refs,
        dedupe_key,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.signal_id,
        x.account_id,
        x.opportunity_id,
        x.action_type,
        x.priority,
        x.status,
        x.summary,
        x.evidence_refs,
        x.dedupe_key,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        signal_id uuid,
        account_id uuid,
        opportunity_id uuid,
        action_type text,
        priority int,
        status text,
        summary text,
        evidence_refs jsonb,
        dedupe_key text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        priority = GREATEST(next_best_actions.priority, EXCLUDED.priority),
        summary = EXCLUDED.summary,
        evidence_refs = EXCLUDED.evidence_refs,
        updated_at = now()
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function extractSignalsAndNba(pool, scope) {
  const [messageRows, linearRows, crmRows] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          conversation_global_id,
          left(content, 1200) AS content
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND private = false
          AND created_at > now() - interval '14 days'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 600
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT
          linear_project_external_id,
          count(*)::int AS overdue_count,
          min(id) AS sample_issue_id
        FROM linear_issues_raw
        WHERE project_id = $1
          AND account_scope_id = $2
          AND completed_at IS NULL
          AND due_date IS NOT NULL
          AND due_date < current_date
        GROUP BY linear_project_external_id
        HAVING count(*) > 0
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        SELECT id, title, next_step
        FROM crm_opportunities
        WHERE project_id = $1
          AND account_scope_id = $2
          AND stage NOT IN ('won', 'lost')
          AND (next_step IS NULL OR length(trim(next_step)) < 6)
        ORDER BY updated_at DESC
        LIMIT 200
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const candidates = [];
  for (const message of messageRows.rows) {
    candidates.push(...detectMessageSignals(message));
  }
  candidates.push(...buildLinearSignals(linearRows.rows));
  candidates.push(...buildCrmSignals(crmRows.rows));

  const signalResult = await upsertSignals(pool, scope, candidates);
  const nbaTouched = await upsertNba(pool, scope, signalResult.rows);
  return {
    generated_candidates: candidates.length,
    touched_signals: signalResult.touched,
    touched_nba: nbaTouched,
  };
}

export async function listSignals(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 400)) : 100;
  const status = String(options.status || "").trim();
  const severityMinRaw = Number.parseInt(String(options.severity_min || "1"), 10);
  const severityMin = Number.isFinite(severityMinRaw) ? Math.max(1, Math.min(5, severityMinRaw)) : 1;
  const { rows } = await pool.query(
    `
      SELECT
        id,
        signal_type,
        severity,
        confidence,
        summary,
        status,
        source_kind,
        evidence_refs,
        created_at
      FROM signals
      WHERE project_id = $1
        AND account_scope_id = $2
        AND severity >= $3
        AND ($4 = '' OR status = $4)
      ORDER BY severity DESC, confidence DESC, created_at DESC
      LIMIT $5
    `,
    [scope.projectId, scope.accountScopeId, severityMin, status, limit]
  );
  return rows;
}

export async function updateSignalStatus(pool, scope, signalId, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!["proposed", "accepted", "dismissed", "done"].includes(normalized)) {
    throw new Error("invalid_signal_status");
  }
  const { rows } = await pool.query(
    `
      UPDATE signals
      SET status = $4
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING id, signal_type, severity, confidence, summary, status, source_kind, evidence_refs, created_at
    `,
    [signalId, scope.projectId, scope.accountScopeId, normalized]
  );
  return rows[0] || null;
}

export async function listNba(pool, scope, options = {}) {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 400)) : 100;
  const status = String(options.status || "").trim();
  const { rows } = await pool.query(
    `
      SELECT
        id,
        signal_id,
        action_type,
        priority,
        status,
        summary,
        due_date,
        owner_username,
        evidence_refs,
        created_at,
        updated_at
      FROM next_best_actions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY priority DESC, updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status, limit]
  );
  return rows;
}

export async function updateNbaStatus(pool, scope, nbaId, status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!["proposed", "accepted", "dismissed", "done", "cancelled"].includes(normalized)) {
    throw new Error("invalid_nba_status");
  }
  const { rows } = await pool.query(
    `
      UPDATE next_best_actions
      SET status = $4,
          updated_at = now()
      WHERE id = $1
        AND project_id = $2
        AND account_scope_id = $3
      RETURNING
        id,
        signal_id,
        action_type,
        priority,
        status,
        summary,
        due_date,
        owner_username,
        evidence_refs,
        created_at,
        updated_at
    `,
    [nbaId, scope.projectId, scope.accountScopeId, normalized]
  );
  return rows[0] || null;
}

export async function getTopNba(pool, scope, limit = 5) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 5;
  const { rows } = await pool.query(
    `
      SELECT
        id,
        signal_id,
        action_type,
        priority,
        status,
        summary,
        evidence_refs,
        updated_at
      FROM next_best_actions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND status IN ('proposed', 'accepted')
      ORDER BY priority DESC, updated_at DESC
      LIMIT $3
    `,
    [scope.projectId, scope.accountScopeId, safeLimit]
  );
  return rows;
}
