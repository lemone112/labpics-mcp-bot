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

function normalizeLinearState(workspaceId, row) {
  const externalId = asText(row?.id || row?.external_id, 200);
  if (!externalId) return null;
  return {
    id: `linstate:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    team_external_id: asText(row?.team?.id || row?.teamId || row?.team_id, 200),
    name: asText(row?.name || `State ${externalId}`, 300),
    type: asText(row?.type, 120),
    position: Number.isFinite(Number(row?.position)) ? Number(row.position) : null,
    data: row || {},
    updated_at: toIsoTime(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at),
  };
}

function normalizeLinearCycle(workspaceId, row) {
  const externalId = asText(row?.id || row?.external_id, 200);
  if (!externalId) return null;
  return {
    id: `lincycle:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    team_external_id: asText(row?.team?.id || row?.teamId || row?.team_id, 200),
    number: Number.isFinite(Number(row?.number)) ? Number(row.number) : null,
    starts_at: toIsoTime(row?.startsAt || row?.starts_at),
    ends_at: toIsoTime(row?.endsAt || row?.ends_at),
    completed_at: toIsoTime(row?.completedAt || row?.completed_at),
    progress: Number.isFinite(Number(row?.progress)) ? Number(row.progress) : null,
    data: row || {},
    updated_at: toIsoTime(row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at),
  };
}

function normalizeLinearIssue(workspaceId, row) {
  const externalId = asText(row?.id || row?.external_id, 200);
  if (!externalId) return null;
  const labelNodes = Array.isArray(row?.labels?.nodes) ? row.labels.nodes : [];
  const blockedByIssues = Array.isArray(row?.blockedByIssues?.nodes) ? row.blockedByIssues.nodes : [];
  const labels = labelNodes.map((item) => asText(item?.name || item?.id, 120)).filter(Boolean);
  return {
    id: `linissue:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    linear_project_external_id: asText(row?.project?.id || row?.projectId || row?.project_id, 200),
    title: asText(row?.title || row?.name || `Issue ${externalId}`, 500),
    state: asText(row?.state?.name || row?.state || row?.status, 100),
    state_external_id: asText(row?.state?.id || row?.stateId, 200),
    state_type: asText(row?.state?.type, 80),
    cycle_external_id: asText(row?.cycle?.id || row?.cycleId, 200),
    cycle_name: asText(
      row?.cycle?.name || (Number.isFinite(Number(row?.cycle?.number)) ? `Cycle ${row.cycle.number}` : null),
      120
    ),
    labels,
    blocked: blockedByIssues.length > 0,
    blocked_by_count: blockedByIssues.length,
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
      workflowStates(first: $limit) {
        nodes {
          id
          name
          type
          position
          updatedAt
          team { id }
        }
      }
      cycles(first: $limit) {
        nodes {
          id
          number
          startsAt
          endsAt
          completedAt
          progress
          updatedAt
          team { id }
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
          state { id name type }
          cycle { id number }
          labels(first: 10) { nodes { id name } }
          blockedByIssues(first: 10) { nodes { id } }
          assignee { name }
        }
      }
    }
  `;
  const data = await linearGraphQL(config.baseUrl, config.apiToken, query, { limit: config.limit }, logger);
  const projects = Array.isArray(data?.projects?.nodes) ? data.projects.nodes : [];
  const states = Array.isArray(data?.workflowStates?.nodes) ? data.workflowStates.nodes : [];
  const cycles = Array.isArray(data?.cycles?.nodes) ? data.cycles.nodes : [];
  const issues = Array.isArray(data?.issues?.nodes) ? data.issues.nodes : [];
  return {
    projects: projects.map((row) => normalizeLinearProject(config.workspaceId, row)).filter(Boolean),
    states: states.map((row) => normalizeLinearState(config.workspaceId, row)).filter(Boolean),
    cycles: cycles.map((row) => normalizeLinearCycle(config.workspaceId, row)).filter(Boolean),
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

  const states = [
    { id: `linstate:${workspaceId}:todo`, workspace_id: workspaceId, external_id: "todo", team_external_id: "team-mock", name: "Todo", type: "unstarted", position: 1, data: { source: "mock" }, updated_at: new Date().toISOString() },
    { id: `linstate:${workspaceId}:progress`, workspace_id: workspaceId, external_id: "progress", team_external_id: "team-mock", name: "In Progress", type: "started", position: 2, data: { source: "mock" }, updated_at: new Date().toISOString() },
    { id: `linstate:${workspaceId}:blocked`, workspace_id: workspaceId, external_id: "blocked", team_external_id: "team-mock", name: "Blocked", type: "started", position: 3, data: { source: "mock" }, updated_at: new Date().toISOString() },
    { id: `linstate:${workspaceId}:done`, workspace_id: workspaceId, external_id: "done", team_external_id: "team-mock", name: "Done", type: "completed", position: 4, data: { source: "mock" }, updated_at: new Date().toISOString() },
  ];
  const cycles = [
    {
      id: `lincycle:${workspaceId}:current`,
      workspace_id: workspaceId,
      external_id: "current",
      team_external_id: "team-mock",
      number: 42,
      starts_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 11 * 86400000).toISOString(),
      completed_at: null,
      progress: 0.4,
      data: { source: "mock" },
      updated_at: new Date().toISOString(),
    },
  ];

  const issues = projects.flatMap((project, pIdx) =>
    Array.from({ length: 3 }).map((_, idx) => ({
      id: `linissue:${workspaceId}:mock-${pIdx + 1}-${idx + 1}`,
      workspace_id: workspaceId,
      external_id: `mock-${pIdx + 1}-${idx + 1}`,
      linear_project_external_id: project.external_id,
      title: `Task ${idx + 1} for ${project.name}`,
      state: idx === 2 ? "Done" : idx === 1 ? "Blocked" : "Todo",
      state_external_id: idx === 2 ? "done" : idx === 1 ? "blocked" : "todo",
      state_type: idx === 2 ? "completed" : idx === 1 ? "started" : "unstarted",
      cycle_external_id: "current",
      cycle_name: "Cycle 42",
      labels: idx === 1 ? ["blocker", "urgent"] : ["delivery"],
      blocked: idx === 1,
      blocked_by_count: idx === 1 ? 1 : 0,
      priority: idx + 1,
      assignee_name: null,
      due_date: new Date(Date.now() + (idx + 1) * 86400000).toISOString().slice(0, 10),
      completed_at: idx === 2 ? new Date().toISOString() : null,
      data: { source: "mock", project: project.external_id },
      updated_at: new Date(Date.now() - idx * 3600000).toISOString(),
    }))
  );

  return { projects, states, cycles, issues, mode: "mock" };
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

async function upsertStates(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
    `
      INSERT INTO linear_states_raw(
        id, project_id, account_scope_id, workspace_id, external_id, team_external_id, name, type, position, data, updated_at
      )
      SELECT
        x.id, x.project_id, x.account_scope_id, x.workspace_id, x.external_id, x.team_external_id, x.name, x.type, x.position, x.data, x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        team_external_id text,
        name text,
        type text,
        position int,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        team_external_id = EXCLUDED.team_external_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        position = EXCLUDED.position,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        linear_states_raw.data IS DISTINCT FROM EXCLUDED.data
        OR linear_states_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR linear_states_raw.name IS DISTINCT FROM EXCLUDED.name
        OR linear_states_raw.type IS DISTINCT FROM EXCLUDED.type
        OR linear_states_raw.position IS DISTINCT FROM EXCLUDED.position
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function upsertCycles(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
    `
      INSERT INTO linear_cycles_raw(
        id,
        project_id,
        account_scope_id,
        workspace_id,
        external_id,
        team_external_id,
        number,
        starts_at,
        ends_at,
        completed_at,
        progress,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.workspace_id,
        x.external_id,
        x.team_external_id,
        x.number,
        x.starts_at,
        x.ends_at,
        x.completed_at,
        x.progress,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        team_external_id text,
        number int,
        starts_at timestamptz,
        ends_at timestamptz,
        completed_at timestamptz,
        progress numeric,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        team_external_id = EXCLUDED.team_external_id,
        number = EXCLUDED.number,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        completed_at = EXCLUDED.completed_at,
        progress = EXCLUDED.progress,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        linear_cycles_raw.data IS DISTINCT FROM EXCLUDED.data
        OR linear_cycles_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR linear_cycles_raw.number IS DISTINCT FROM EXCLUDED.number
        OR linear_cycles_raw.starts_at IS DISTINCT FROM EXCLUDED.starts_at
        OR linear_cycles_raw.ends_at IS DISTINCT FROM EXCLUDED.ends_at
        OR linear_cycles_raw.completed_at IS DISTINCT FROM EXCLUDED.completed_at
        OR linear_cycles_raw.progress IS DISTINCT FROM EXCLUDED.progress
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
        state_external_id,
        state_type,
        cycle_external_id,
        cycle_name,
        labels,
        blocked,
        blocked_by_count,
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
        x.state_external_id,
        x.state_type,
        x.cycle_external_id,
        x.cycle_name,
        x.labels,
        x.blocked,
        x.blocked_by_count,
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
        state_external_id text,
        state_type text,
        cycle_external_id text,
        cycle_name text,
        labels text[],
        blocked boolean,
        blocked_by_count int,
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
        state_external_id = EXCLUDED.state_external_id,
        state_type = EXCLUDED.state_type,
        cycle_external_id = EXCLUDED.cycle_external_id,
        cycle_name = EXCLUDED.cycle_name,
        labels = EXCLUDED.labels,
        blocked = EXCLUDED.blocked,
        blocked_by_count = EXCLUDED.blocked_by_count,
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
        OR linear_issues_raw.state_external_id IS DISTINCT FROM EXCLUDED.state_external_id
        OR linear_issues_raw.state_type IS DISTINCT FROM EXCLUDED.state_type
        OR linear_issues_raw.cycle_external_id IS DISTINCT FROM EXCLUDED.cycle_external_id
        OR linear_issues_raw.cycle_name IS DISTINCT FROM EXCLUDED.cycle_name
        OR linear_issues_raw.labels IS DISTINCT FROM EXCLUDED.labels
        OR linear_issues_raw.blocked IS DISTINCT FROM EXCLUDED.blocked
        OR linear_issues_raw.blocked_by_count IS DISTINCT FROM EXCLUDED.blocked_by_count
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
  const touchedStates = await upsertStates(pool, scope, snapshot.states || []);
  const touchedCycles = await upsertCycles(pool, scope, snapshot.cycles || []);
  const touchedIssues = await upsertIssues(pool, scope, snapshot.issues);
  const cursor = computeCursor([...snapshot.projects, ...(snapshot.states || []), ...(snapshot.cycles || []), ...snapshot.issues]);

  await upsertWatermark(pool, scope, source, cursor.cursorTs, cursor.cursorId, {
    mode: snapshot.mode,
    touched_projects: touchedProjects,
    touched_states: touchedStates,
    touched_cycles: touchedCycles,
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
    touched_states: touchedStates,
    touched_cycles: touchedCycles,
    touched_issues: touchedIssues,
    cursor_ts: cursor.cursorTs,
    cursor_id: cursor.cursorId,
  };
}
