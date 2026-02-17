import { fetchWithRetry } from "../lib/http.js";
import { toIsoTime, toPositiveInt } from "../lib/chunking.js";
import { resolveProjectSourceBinding } from "./sources.js";

function asText(value, maxLen = 1000) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLen) : null;
}

function boolFromEnv(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function getWatermark(pool, scope, source) {
  const { rows } = await pool.query(
    `
      SELECT cursor_ts, cursor_id
      FROM sync_watermarks
      WHERE project_id = $1
        AND account_scope_id = $2
        AND source = $3
      LIMIT 1
    `,
    [scope.projectId, scope.accountScopeId, source]
  );
  return rows[0] || null;
}

async function upsertWatermark(pool, scope, source, cursorTs, cursorId, meta) {
  await pool.query(
    `
      INSERT INTO sync_watermarks(project_id, account_scope_id, source, cursor_ts, cursor_id, meta, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      ON CONFLICT (project_id, source)
      DO UPDATE SET
        account_scope_id = EXCLUDED.account_scope_id,
        cursor_ts = EXCLUDED.cursor_ts,
        cursor_id = EXCLUDED.cursor_id,
        meta = EXCLUDED.meta,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId, source, cursorTs, cursorId, JSON.stringify(meta || {})]
  );
}

async function linearGraphQL(baseUrl, token, query, variables, logger) {
  const response = await fetchWithRetry(baseUrl, {
    method: "POST",
    timeoutMs: 20_000,
    retries: 2,
    logger,
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Linear GraphQL failed (${response.status})`);
  }
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Linear GraphQL returned invalid JSON");
  }
  if (payload?.errors?.length) {
    throw new Error(`Linear GraphQL errors: ${payload.errors[0]?.message || "unknown"}`);
  }
  return payload?.data || {};
}

function normalizeLinearProject(workspaceId, row) {
  const externalId = asText(row?.id || row?.external_id, 200);
  if (!externalId) return null;
  return {
    id: `linproj:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    name: asText(row?.name || `Project ${externalId}`, 300),
    state: asText(row?.state || row?.status, 80),
    lead_name: asText(row?.lead?.name || row?.lead_name, 200),
    data: row || {},
    updated_at: toIsoTime(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at),
  };
}

function normalizeLinearIssue(workspaceId, row) {
  const externalId = asText(row?.id || row?.external_id, 200);
  if (!externalId) return null;
  return {
    id: `linissue:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    linear_project_external_id: asText(row?.project?.id || row?.projectId || row?.project_id, 200),
    title: asText(row?.title || row?.name || `Issue ${externalId}`, 500),
    state: asText(row?.state?.name || row?.state || row?.status, 100),
    priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : null,
    assignee_name: asText(row?.assignee?.name || row?.assignee_name, 200),
    due_date: asText(row?.dueDate || row?.due_date, 20),
    completed_at: toIsoTime(row?.completedAt || row?.completed_at),
    data: row || {},
    updated_at: toIsoTime(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at),
  };
}

async function loadLinearApiSnapshot(config, logger) {
  const query = `
    query PullLinear($limit: Int!) {
      projects(first: $limit) {
        nodes {
          id
          name
          state
          updatedAt
          lead { name }
        }
      }
      issues(first: $limit, orderBy: updatedAt) {
        nodes {
          id
          title
          priority
          dueDate
          updatedAt
          completedAt
          project { id }
          state { name }
          assignee { name }
        }
      }
    }
  `;
  const data = await linearGraphQL(config.baseUrl, config.apiToken, query, { limit: config.limit }, logger);
  const projects = Array.isArray(data?.projects?.nodes) ? data.projects.nodes : [];
  const issues = Array.isArray(data?.issues?.nodes) ? data.issues.nodes : [];
  return {
    projects: projects.map((row) => normalizeLinearProject(config.workspaceId, row)).filter(Boolean),
    issues: issues.map((row) => normalizeLinearIssue(config.workspaceId, row)).filter(Boolean),
    mode: "api",
  };
}

async function loadLinearMockSnapshot(pool, scope, workspaceId) {
  const conversations = await pool.query(
    `
      SELECT id, updated_at
      FROM cw_conversations
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 12
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const projects = conversations.rows.slice(0, 6).map((row, idx) => ({
    id: `linproj:${workspaceId}:mock-${idx + 1}`,
    workspace_id: workspaceId,
    external_id: `mock-${idx + 1}`,
    name: `Delivery Stream ${idx + 1}`,
    state: idx % 3 === 0 ? "active" : "planned",
    lead_name: null,
    data: { source: "mock", from_conversation_id: row.id },
    updated_at: row.updated_at || new Date().toISOString(),
  }));

  const issues = projects.flatMap((project, pIdx) =>
    Array.from({ length: 3 }).map((_, idx) => ({
      id: `linissue:${workspaceId}:mock-${pIdx + 1}-${idx + 1}`,
      workspace_id: workspaceId,
      external_id: `mock-${pIdx + 1}-${idx + 1}`,
      linear_project_external_id: project.external_id,
      title: `Task ${idx + 1} for ${project.name}`,
      state: idx === 2 ? "Done" : idx === 1 ? "In Progress" : "Todo",
      priority: idx + 1,
      assignee_name: null,
      due_date: new Date(Date.now() + (idx + 1) * 86400000).toISOString().slice(0, 10),
      completed_at: idx === 2 ? new Date().toISOString() : null,
      data: { source: "mock", project: project.external_id },
      updated_at: new Date(Date.now() - idx * 3600000).toISOString(),
    }))
  );

  return { projects, issues, mode: "mock" };
}

async function upsertProjects(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
    `
      INSERT INTO linear_projects_raw(
        id, project_id, account_scope_id, workspace_id, external_id, name, state, lead_name, data, updated_at
      )
      SELECT
        x.id, x.project_id, x.account_scope_id, x.workspace_id, x.external_id, x.name, x.state, x.lead_name, x.data, x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        name text,
        state text,
        lead_name text,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        name = EXCLUDED.name,
        state = EXCLUDED.state,
        lead_name = EXCLUDED.lead_name,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        linear_projects_raw.data IS DISTINCT FROM EXCLUDED.data
        OR linear_projects_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR linear_projects_raw.name IS DISTINCT FROM EXCLUDED.name
        OR linear_projects_raw.state IS DISTINCT FROM EXCLUDED.state
        OR linear_projects_raw.lead_name IS DISTINCT FROM EXCLUDED.lead_name
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function upsertIssues(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
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
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.workspace_id,
        x.external_id,
        x.linear_project_external_id,
        x.title,
        x.state,
        x.priority,
        x.assignee_name,
        x.due_date,
        x.completed_at,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        linear_project_external_id text,
        title text,
        state text,
        priority int,
        assignee_name text,
        due_date date,
        completed_at timestamptz,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        linear_project_external_id = EXCLUDED.linear_project_external_id,
        title = EXCLUDED.title,
        state = EXCLUDED.state,
        priority = EXCLUDED.priority,
        assignee_name = EXCLUDED.assignee_name,
        due_date = EXCLUDED.due_date,
        completed_at = EXCLUDED.completed_at,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        linear_issues_raw.data IS DISTINCT FROM EXCLUDED.data
        OR linear_issues_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR linear_issues_raw.title IS DISTINCT FROM EXCLUDED.title
        OR linear_issues_raw.state IS DISTINCT FROM EXCLUDED.state
        OR linear_issues_raw.priority IS DISTINCT FROM EXCLUDED.priority
        OR linear_issues_raw.assignee_name IS DISTINCT FROM EXCLUDED.assignee_name
        OR linear_issues_raw.due_date IS DISTINCT FROM EXCLUDED.due_date
        OR linear_issues_raw.completed_at IS DISTINCT FROM EXCLUDED.completed_at
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

function computeCursor(rows) {
  let cursorTs = null;
  let cursorId = null;
  for (const row of rows) {
    const ts = toIsoTime(row.updated_at || row.created_at);
    if (!ts) continue;
    if (!cursorTs || ts > cursorTs) {
      cursorTs = ts;
      cursorId = row.id || row.external_id || cursorId;
    }
  }
  return { cursorTs, cursorId };
}

export async function runLinearSync(pool, scope, logger = console) {
  const fallbackWorkspaceId = String(process.env.LINEAR_WORKSPACE_ID || `auto-${String(scope.projectId).slice(0, 8)}`);
  const workspaceId = await resolveProjectSourceBinding(
    pool,
    scope,
    "linear_workspace",
    fallbackWorkspaceId,
    { source: "env_bootstrap" }
  );
  const source = `linear:${workspaceId}`;
  const config = {
    workspaceId,
    baseUrl: String(process.env.LINEAR_BASE_URL || "https://api.linear.app/graphql").replace(/\/+$/, ""),
    apiToken: String(process.env.LINEAR_API_TOKEN || "").trim(),
    mockMode: boolFromEnv(process.env.LINEAR_MOCK_MODE, !process.env.LINEAR_API_TOKEN),
    limit: toPositiveInt(process.env.LINEAR_SYNC_LIMIT, 200, 1, 1000),
  };

  const previousWatermark = await getWatermark(pool, scope, source);
  const snapshot = config.mockMode || !config.apiToken
    ? await loadLinearMockSnapshot(pool, scope, workspaceId)
    : await loadLinearApiSnapshot(config, logger);

  const touchedProjects = await upsertProjects(pool, scope, snapshot.projects);
  const touchedIssues = await upsertIssues(pool, scope, snapshot.issues);
  const cursor = computeCursor([...snapshot.projects, ...snapshot.issues]);

  await upsertWatermark(pool, scope, source, cursor.cursorTs, cursor.cursorId, {
    mode: snapshot.mode,
    touched_projects: touchedProjects,
    touched_issues: touchedIssues,
    previous_cursor_ts: previousWatermark?.cursor_ts || null,
    synced_at: new Date().toISOString(),
  });

  return {
    source,
    mode: snapshot.mode,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    touched_projects: touchedProjects,
    touched_issues: touchedIssues,
    cursor_ts: cursor.cursorTs,
    cursor_id: cursor.cursorId,
  };
}
