import crypto from "node:crypto";
import type { Pool, ProjectScope } from "../../types/index.js";

interface ContinuityCandidate {
  source_type: string;
  source_ref: string;
  title: string;
  description: string;
  preview_payload: Record<string, unknown>;
  evidence_refs: string[];
}

interface OpportunityRow {
  id: string;
  title: string | null;
  next_step: string | null;
  expected_close_date: string | null;
}

interface MessageRow {
  id: string;
  conversation_global_id: string | null;
  content: string | null;
}

interface ContinuityActionRow {
  id: string;
  source_type: string;
  source_ref: string;
  title: string;
  description: string;
  preview_payload: Record<string, unknown> | null;
  linear_issue_external_id: string | null;
  status: string;
  evidence_refs: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ListContinuityOptions {
  status?: unknown;
  limit?: unknown;
}

interface SelectedActionRow {
  id: string;
  title: string;
  description: string;
  preview_payload: Record<string, unknown> | null;
  status: string;
}

function dedupeKey(
  projectId: string,
  sourceType: string,
  sourceRef: string,
  title: string
): string {
  return crypto
    .createHash("sha1")
    .update(`${projectId}:${sourceType}:${sourceRef}:${title}`)
    .digest("hex");
}

function pickContinuityFromOpportunity(
  row: OpportunityRow
): ContinuityCandidate | null {
  const nextStep = String(row.next_step || "").trim();
  if (!nextStep || nextStep.length < 5) return null;
  return {
    source_type: "attio",
    source_ref: row.id,
    title: `Deal continuity: ${row.title || "Opportunity follow-up"}`,
    description: nextStep,
    preview_payload: {
      suggested_linear_title: `Follow-up: ${row.title || "Opportunity"}`,
      suggested_due_date: row.expected_close_date || null,
      from_opportunity_id: row.id,
    },
    evidence_refs: [row.id],
  };
}

function pickContinuityFromMessage(row: MessageRow): ContinuityCandidate | null {
  const text = String(row.content || "");
  if (
    !/(we will|i will|promise|commit|deliver|send by|by friday|next week)/i.test(
      text
    )
  ) {
    return null;
  }
  return {
    source_type: "chatwoot",
    source_ref: row.id,
    title: "Message commitment follow-up",
    description: text.slice(0, 300),
    preview_payload: {
      suggested_linear_title: "Follow-up on chat commitment",
      from_message_id: row.id,
      conversation_global_id: row.conversation_global_id,
    },
    evidence_refs: [row.id, row.conversation_global_id].filter(Boolean) as string[],
  };
}

async function upsertContinuity(
  pool: Pool,
  scope: ProjectScope,
  rows: ContinuityCandidate[],
  actorUsername: string | null = null
): Promise<{ touched: number; rows: ContinuityActionRow[] }> {
  if (!rows.length) return { touched: 0, rows: [] };
  const payload = rows.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    source_type: row.source_type,
    source_ref: row.source_ref,
    title: row.title,
    description: row.description,
    preview_payload: row.preview_payload || {},
    status: "previewed",
    evidence_refs: row.evidence_refs || [],
    dedupe_key: dedupeKey(
      scope.projectId,
      row.source_type,
      row.source_ref,
      row.title
    ),
    created_by: actorUsername,
  }));

  const result = await pool.query<ContinuityActionRow>(
    `
      INSERT INTO continuity_actions(
        project_id,
        account_scope_id,
        source_type,
        source_ref,
        title,
        description,
        preview_payload,
        status,
        evidence_refs,
        dedupe_key,
        created_by,
        updated_at
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.source_type,
        x.source_ref,
        x.title,
        x.description,
        x.preview_payload,
        x.status,
        x.evidence_refs,
        x.dedupe_key,
        x.created_by,
        now()
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        source_type text,
        source_ref text,
        title text,
        description text,
        preview_payload jsonb,
        status text,
        evidence_refs jsonb,
        dedupe_key text,
        created_by text
      )
      ON CONFLICT (project_id, dedupe_key)
      DO UPDATE SET
        description = EXCLUDED.description,
        preview_payload = EXCLUDED.preview_payload,
        evidence_refs = EXCLUDED.evidence_refs,
        updated_at = now()
      WHERE continuity_actions.status IN ('previewed', 'failed')
      RETURNING
        id,
        source_type,
        source_ref,
        title,
        description,
        preview_payload,
        linear_issue_external_id,
        status,
        evidence_refs,
        created_by,
        created_at,
        updated_at
    `,
    [JSON.stringify(payload)]
  );
  return {
    touched: result.rowCount || 0,
    rows: result.rows,
  };
}

export async function buildContinuityPreview(
  pool: Pool,
  scope: ProjectScope,
  actorUsername: string | null = null
): Promise<{ touched: number; rows: ContinuityActionRow[] }> {
  const [opportunities, messages] = await Promise.all([
    pool.query<OpportunityRow>(
      `
        SELECT id, title, next_step, expected_close_date
        FROM crm_opportunities
        WHERE project_id = $1
          AND account_scope_id = $2
          AND stage NOT IN ('won', 'lost')
        ORDER BY updated_at DESC
        LIMIT 200
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query<MessageRow>(
      `
        SELECT id, conversation_global_id, left(content, 1200) AS content
        FROM cw_messages
        WHERE project_id = $1
          AND account_scope_id = $2
          AND private = false
          AND created_at > now() - interval '21 days'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 300
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const candidates: ContinuityCandidate[] = [];
  for (const row of opportunities.rows) {
    const candidate = pickContinuityFromOpportunity(row);
    if (candidate) candidates.push(candidate);
  }
  for (const row of messages.rows) {
    const candidate = pickContinuityFromMessage(row);
    if (candidate) candidates.push(candidate);
  }
  return upsertContinuity(pool, scope, candidates, actorUsername);
}

export async function listContinuityActions(
  pool: Pool,
  scope: ProjectScope,
  options: ListContinuityOptions = {}
): Promise<ContinuityActionRow[]> {
  const limitRaw = Number.parseInt(String(options.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(limitRaw, 400))
    : 100;
  const status = String(options.status || "").trim();
  const { rows } = await pool.query<ContinuityActionRow>(
    `
      SELECT
        id,
        source_type,
        source_ref,
        title,
        description,
        preview_payload,
        linear_issue_external_id,
        status,
        evidence_refs,
        created_by,
        created_at,
        updated_at
      FROM continuity_actions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND ($3 = '' OR status = $3)
      ORDER BY updated_at DESC
      LIMIT $4
    `,
    [scope.projectId, scope.accountScopeId, status, limit]
  );
  return rows;
}

export async function applyContinuityActions(
  pool: Pool,
  scope: ProjectScope,
  actionIds: string[] = [],
  actorUsername: string | null = null
): Promise<{ applied: number; actions: ContinuityActionRow[] }> {
  if (!Array.isArray(actionIds) || !actionIds.length) {
    return { applied: 0, actions: [] };
  }
  const selected = await pool.query<SelectedActionRow>(
    `
      SELECT
        id,
        title,
        description,
        preview_payload,
        status
      FROM continuity_actions
      WHERE project_id = $1
        AND account_scope_id = $2
        AND id = ANY($3::uuid[])
        AND status IN ('previewed', 'failed')
    `,
    [scope.projectId, scope.accountScopeId, actionIds]
  );
  if (!selected.rows.length) {
    return { applied: 0, actions: [] };
  }

  for (const action of selected.rows) {
    const linearProject = await pool.query<{ external_id: string }>(
      `
        SELECT external_id
        FROM linear_projects_raw
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [scope.projectId, scope.accountScopeId]
    );
    const linearProjectExternalId =
      linearProject.rows[0]?.external_id || "continuity-fallback";
    const issueExternalId = `continuity:${action.id}`;
    const issueId = `linissue:${scope.projectId}:${issueExternalId}`;
    const suggestedTitle = String(
      (action.preview_payload?.suggested_linear_title as string) || action.title
    );

    await pool.query(
      `
        INSERT INTO linear_issues_raw(
          id,
          project_id,
          account_scope_id,
          workspace_id,
          external_id,
          linear_project_external_id,
          title,
          state,
          priority,
          assignee_name,
          due_date,
          completed_at,
          data,
          updated_at
        )
        VALUES (
          $1, $2, $3, 'continuity', $4, $5, $6, 'Todo', 2, $7, NULL, NULL, $8::jsonb, now()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          title = EXCLUDED.title,
          assignee_name = EXCLUDED.assignee_name,
          data = EXCLUDED.data,
          updated_at = now()
      `,
      [
        issueId,
        scope.projectId,
        scope.accountScopeId,
        issueExternalId,
        linearProjectExternalId,
        suggestedTitle,
        actorUsername,
        JSON.stringify({
          source: "continuity_apply",
          action_id: action.id,
          description: action.description,
        }),
      ]
    );

    await pool.query(
      `
        UPDATE continuity_actions
        SET
          status = 'applied',
          linear_issue_external_id = $4,
          created_by = COALESCE(created_by, $5),
          updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
      `,
      [action.id, scope.projectId, scope.accountScopeId, issueExternalId, actorUsername]
    );
  }

  const updated = await listContinuityActions(pool, scope, {
    status: "applied",
    limit: 200,
  });
  return {
    applied: selected.rows.length,
    actions: updated.filter((row) => actionIds.includes(row.id)),
  };
}
