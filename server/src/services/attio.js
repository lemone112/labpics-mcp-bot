import { fetchWithRetry } from "../lib/http.js";
import { toIsoTime, toPositiveInt } from "../lib/chunking.js";
import { resolveProjectSourceBinding } from "./sources.js";

function asText(value, maxLen = 1000) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLen) : null;
}

function toAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function boolFromEnv(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function getWatermark(pool, scope, source) {
  const { rows } = await pool.query(
    `
      SELECT cursor_ts, cursor_id, meta
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

function pickArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeCompany(row, workspaceId) {
  const record = row?.record || row?.data || row || {};
  const externalId = asText(record?.id || record?.record_id || record?.company_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  const name = asText(values?.name || record?.name || row?.name, 300);
  const domain = asText(values?.domain || record?.domain || row?.domain, 300);
  const stage = asText(values?.stage || record?.stage || row?.stage, 100);
  const annualRevenue = toAmount(values?.annual_revenue || values?.revenue || record?.annual_revenue || row?.annual_revenue);
  const updatedAt = toIsoTime(record?.updated_at || row?.updated_at || record?.created_at || row?.created_at);
  return {
    id: `attioacct:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    name,
    domain,
    annual_revenue: annualRevenue,
    stage,
    data: record,
    updated_at: updatedAt,
  };
}

function normalizeOpportunity(row, workspaceId) {
  const record = row?.record || row?.data || row || {};
  const externalId = asText(record?.id || record?.record_id || record?.deal_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  const title = asText(values?.name || record?.name || row?.name || `Opportunity ${externalId}`, 500);
  const stage = asText(values?.stage || record?.stage || row?.stage, 120) || "discovery";
  const amount = toAmount(values?.amount || values?.amount_estimate || record?.amount || row?.amount);
  const probabilityRaw = Number(values?.probability || record?.probability || row?.probability);
  const probability = Number.isFinite(probabilityRaw) ? Math.max(0, Math.min(1, probabilityRaw)) : 0.1;
  const expectedCloseDate = asText(values?.expected_close_date || record?.expected_close_date || row?.expected_close_date, 50);
  const accountExternalId = asText(
    values?.account_id || values?.company_id || record?.account_id || row?.account_id || row?.company_id,
    200
  );
  const nextStep = asText(values?.next_step || record?.next_step || row?.next_step, 1000);
  const updatedAt = toIsoTime(record?.updated_at || row?.updated_at || record?.created_at || row?.created_at);
  return {
    id: `attiodeal:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    account_external_id: accountExternalId,
    title,
    stage,
    amount,
    probability,
    expected_close_date: expectedCloseDate,
    next_step: nextStep,
    data: record,
    updated_at: updatedAt,
  };
}

function normalizePerson(row, workspaceId) {
  const record = row?.record || row?.data || row || {};
  const externalId = asText(record?.id || record?.record_id || record?.person_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  return {
    id: `attioperson:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    account_external_id: asText(values?.company_id || values?.account_id || record?.company_id || row?.company_id, 200),
    full_name: asText(values?.name || record?.name || row?.name, 300),
    email: asText(values?.email || record?.email || row?.email, 320),
    role: asText(values?.role || record?.role || row?.role, 200),
    data: record,
    updated_at: toIsoTime(record?.updated_at || row?.updated_at || record?.created_at || row?.created_at),
  };
}

function normalizeActivity(row, workspaceId) {
  const record = row?.record || row?.data || row || {};
  const externalId = asText(record?.id || record?.record_id || record?.activity_id || row?.id, 220);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  return {
    id: `attioact:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    record_external_id: asText(
      values?.record_id || values?.deal_id || values?.company_id || record?.record_id || row?.record_id,
      220
    ),
    activity_type: asText(values?.type || record?.type || row?.type, 120),
    note: asText(values?.note || record?.note || row?.note, 4000),
    actor_name: asText(values?.actor_name || record?.actor_name || row?.actor_name, 250),
    occurred_at: toIsoTime(values?.occurred_at || record?.occurred_at || row?.occurred_at || row?.created_at),
    data: record,
    updated_at: toIsoTime(record?.updated_at || row?.updated_at || record?.created_at || row?.created_at),
  };
}

async function attioGet(baseUrl, token, endpoint, logger) {
  const response = await fetchWithRetry(`${baseUrl}${endpoint}`, {
    method: "GET",
    timeoutMs: 20_000,
    retries: 2,
    logger,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Attio GET ${endpoint} failed (${response.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Attio GET ${endpoint} returned invalid JSON`);
  }
}

async function loadMockSnapshot(pool, scope, workspaceId) {
  const contacts = await pool.query(
    `
      SELECT id, name, email, updated_at
      FROM cw_contacts
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 40
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const companies = contacts.rows.map((row, idx) => ({
    id: `attioacct:${workspaceId}:mock-${idx + 1}`,
    workspace_id: workspaceId,
    external_id: `mock-${idx + 1}`,
    name: row.name || row.email || `Mock Account ${idx + 1}`,
    domain: row.email && row.email.includes("@") ? row.email.split("@")[1] : null,
    annual_revenue: Number((50000 + idx * 2000).toFixed(2)),
    stage: idx % 3 === 0 ? "active" : "prospect",
    data: { source: "mock", from_contact_id: row.id },
    updated_at: row.updated_at || new Date().toISOString(),
  }));

  const opportunities = companies.slice(0, 20).map((company, idx) => ({
    id: `attiodeal:${workspaceId}:mock-${idx + 1}`,
    workspace_id: workspaceId,
    external_id: `mock-${idx + 1}`,
    account_external_id: company.external_id,
    title: `${company.name} Expansion`,
    stage: idx % 5 === 0 ? "proposal" : "qualified",
    amount: Number((15000 + idx * 750).toFixed(2)),
    probability: idx % 5 === 0 ? 0.7 : 0.45,
    expected_close_date: new Date(Date.now() + (idx + 3) * 86400000).toISOString().slice(0, 10),
    next_step: "Prepare proposal follow-up",
    data: { source: "mock", account: company.external_id },
    updated_at: new Date(Date.now() - idx * 3600000).toISOString(),
  }));

  const people = companies.slice(0, 12).map((company, idx) => ({
    id: `attioperson:${workspaceId}:mock-${idx + 1}`,
    workspace_id: workspaceId,
    external_id: `mock-${idx + 1}`,
    account_external_id: company.external_id,
    full_name: `Contact ${idx + 1}`,
    email: `contact${idx + 1}@${company.domain || "example.com"}`,
    role: idx % 2 === 0 ? "buyer" : "influencer",
    data: { source: "mock", company: company.external_id },
    updated_at: new Date(Date.now() - idx * 1800000).toISOString(),
  }));
  const activities = opportunities.slice(0, 10).map((deal, idx) => ({
    id: `attioact:${workspaceId}:mock-${idx + 1}`,
    workspace_id: workspaceId,
    external_id: `mock-${idx + 1}`,
    record_external_id: deal.external_id,
    activity_type: idx % 3 === 0 ? "note" : idx % 3 === 1 ? "invoice_sent" : "invoice_paid",
    note: idx % 3 === 0 ? "Client asked for expanded scope details" : null,
    actor_name: "Mock SDR",
    occurred_at: new Date(Date.now() - idx * 7200000).toISOString(),
    data: { source: "mock", deal: deal.external_id },
    updated_at: new Date(Date.now() - idx * 7200000).toISOString(),
  }));

  return { companies, opportunities, people, activities, mode: "mock" };
}

async function loadAttioSnapshot(pool, scope, config, logger) {
  const useMock = config.mockMode || !config.apiToken;
  if (useMock) {
    return loadMockSnapshot(pool, scope, config.workspaceId);
  }

  const companiesPayload = await attioGet(
    config.baseUrl,
    config.apiToken,
    `/v2/objects/companies/records?limit=${config.limit}`,
    logger
  );
  const opportunitiesPayload = await attioGet(
    config.baseUrl,
    config.apiToken,
    `/v2/objects/deals/records?limit=${config.limit}`,
    logger
  );
  let peoplePayload = { data: [] };
  let activitiesPayload = { data: [] };
  try {
    peoplePayload = await attioGet(
      config.baseUrl,
      config.apiToken,
      `/v2/objects/people/records?limit=${config.limit}`,
      logger
    );
  } catch (error) {
    logger.warn({ err: String(error?.message || error) }, "attio people endpoint unavailable, continuing");
  }
  try {
    activitiesPayload = await attioGet(
      config.baseUrl,
      config.apiToken,
      `/v2/activities?limit=${config.limit}`,
      logger
    );
  } catch (error) {
    logger.warn({ err: String(error?.message || error) }, "attio activities endpoint unavailable, continuing");
  }

  const companies = pickArray(companiesPayload)
    .map((row) => normalizeCompany(row, config.workspaceId))
    .filter(Boolean);
  const opportunities = pickArray(opportunitiesPayload)
    .map((row) => normalizeOpportunity(row, config.workspaceId))
    .filter(Boolean);
  const people = pickArray(peoplePayload)
    .map((row) => normalizePerson(row, config.workspaceId))
    .filter(Boolean);
  const activities = pickArray(activitiesPayload)
    .map((row) => normalizeActivity(row, config.workspaceId))
    .filter(Boolean);

  return {
    companies,
    opportunities,
    people,
    activities,
    mode: "api",
  };
}

async function upsertCompanies(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    workspace_id: row.workspace_id,
    external_id: row.external_id,
    name: row.name,
    domain: row.domain,
    annual_revenue: row.annual_revenue,
    stage: row.stage,
    data: row.data || {},
    updated_at: row.updated_at,
  }));
  const result = await pool.query(
    `
      INSERT INTO attio_accounts_raw(
        id, project_id, account_scope_id, workspace_id, external_id, name, domain, annual_revenue, stage, data, updated_at
      )
      SELECT
        x.id, x.project_id, x.account_scope_id, x.workspace_id, x.external_id, x.name, x.domain, x.annual_revenue, x.stage, x.data, x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        name text,
        domain text,
        annual_revenue numeric,
        stage text,
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
        domain = EXCLUDED.domain,
        annual_revenue = EXCLUDED.annual_revenue,
        stage = EXCLUDED.stage,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        attio_accounts_raw.data IS DISTINCT FROM EXCLUDED.data
        OR attio_accounts_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR attio_accounts_raw.name IS DISTINCT FROM EXCLUDED.name
        OR attio_accounts_raw.domain IS DISTINCT FROM EXCLUDED.domain
        OR attio_accounts_raw.annual_revenue IS DISTINCT FROM EXCLUDED.annual_revenue
        OR attio_accounts_raw.stage IS DISTINCT FROM EXCLUDED.stage
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function upsertOpportunities(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    id: row.id,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    workspace_id: row.workspace_id,
    external_id: row.external_id,
    account_external_id: row.account_external_id,
    title: row.title,
    stage: row.stage,
    amount: row.amount,
    probability: row.probability,
    expected_close_date: row.expected_close_date,
    next_step: row.next_step,
    data: row.data || {},
    updated_at: row.updated_at,
  }));
  const result = await pool.query(
    `
      INSERT INTO attio_opportunities_raw(
        id,
        project_id,
        account_scope_id,
        workspace_id,
        external_id,
        account_external_id,
        title,
        stage,
        amount,
        probability,
        expected_close_date,
        next_step,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.workspace_id,
        x.external_id,
        x.account_external_id,
        x.title,
        x.stage,
        x.amount,
        x.probability,
        x.expected_close_date,
        x.next_step,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        account_external_id text,
        title text,
        stage text,
        amount numeric,
        probability numeric,
        expected_close_date date,
        next_step text,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        account_external_id = EXCLUDED.account_external_id,
        title = EXCLUDED.title,
        stage = EXCLUDED.stage,
        amount = EXCLUDED.amount,
        probability = EXCLUDED.probability,
        expected_close_date = EXCLUDED.expected_close_date,
        next_step = EXCLUDED.next_step,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        attio_opportunities_raw.data IS DISTINCT FROM EXCLUDED.data
        OR attio_opportunities_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR attio_opportunities_raw.title IS DISTINCT FROM EXCLUDED.title
        OR attio_opportunities_raw.stage IS DISTINCT FROM EXCLUDED.stage
        OR attio_opportunities_raw.amount IS DISTINCT FROM EXCLUDED.amount
        OR attio_opportunities_raw.probability IS DISTINCT FROM EXCLUDED.probability
        OR attio_opportunities_raw.expected_close_date IS DISTINCT FROM EXCLUDED.expected_close_date
        OR attio_opportunities_raw.next_step IS DISTINCT FROM EXCLUDED.next_step
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function upsertPeople(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
    `
      INSERT INTO attio_people_raw(
        id,
        project_id,
        account_scope_id,
        workspace_id,
        external_id,
        account_external_id,
        full_name,
        email,
        role,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.workspace_id,
        x.external_id,
        x.account_external_id,
        x.full_name,
        x.email,
        x.role,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        account_external_id text,
        full_name text,
        email text,
        role text,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        account_external_id = EXCLUDED.account_external_id,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        attio_people_raw.data IS DISTINCT FROM EXCLUDED.data
        OR attio_people_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR attio_people_raw.full_name IS DISTINCT FROM EXCLUDED.full_name
        OR attio_people_raw.email IS DISTINCT FROM EXCLUDED.email
        OR attio_people_raw.role IS DISTINCT FROM EXCLUDED.role
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function upsertActivities(pool, scope, rows) {
  if (!rows.length) return 0;
  const payload = rows.map((row) => ({
    ...row,
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
  }));
  const result = await pool.query(
    `
      INSERT INTO attio_activities_raw(
        id,
        project_id,
        account_scope_id,
        workspace_id,
        external_id,
        record_external_id,
        activity_type,
        note,
        actor_name,
        occurred_at,
        data,
        updated_at
      )
      SELECT
        x.id,
        x.project_id,
        x.account_scope_id,
        x.workspace_id,
        x.external_id,
        x.record_external_id,
        x.activity_type,
        x.note,
        x.actor_name,
        x.occurred_at,
        x.data,
        x.updated_at
      FROM jsonb_to_recordset($1::jsonb) AS x(
        id text,
        project_id uuid,
        account_scope_id uuid,
        workspace_id text,
        external_id text,
        record_external_id text,
        activity_type text,
        note text,
        actor_name text,
        occurred_at timestamptz,
        data jsonb,
        updated_at timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        account_scope_id = EXCLUDED.account_scope_id,
        workspace_id = EXCLUDED.workspace_id,
        external_id = EXCLUDED.external_id,
        record_external_id = EXCLUDED.record_external_id,
        activity_type = EXCLUDED.activity_type,
        note = EXCLUDED.note,
        actor_name = EXCLUDED.actor_name,
        occurred_at = EXCLUDED.occurred_at,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
      WHERE
        attio_activities_raw.data IS DISTINCT FROM EXCLUDED.data
        OR attio_activities_raw.updated_at IS DISTINCT FROM EXCLUDED.updated_at
        OR attio_activities_raw.activity_type IS DISTINCT FROM EXCLUDED.activity_type
        OR attio_activities_raw.note IS DISTINCT FROM EXCLUDED.note
        OR attio_activities_raw.actor_name IS DISTINCT FROM EXCLUDED.actor_name
        OR attio_activities_raw.occurred_at IS DISTINCT FROM EXCLUDED.occurred_at
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

async function mirrorToCrmTables(pool, scope) {
  await pool.query(
    `
      INSERT INTO crm_accounts(project_id, account_scope_id, name, domain, external_ref, stage, owner_username, updated_at)
      SELECT
        ar.project_id,
        ar.account_scope_id,
        COALESCE(ar.name, ar.external_id),
        ar.domain,
        ar.external_id,
        COALESCE(NULLIF(ar.stage, ''), 'prospect'),
        NULL,
        now()
      FROM attio_accounts_raw AS ar
      WHERE ar.project_id = $1
        AND ar.account_scope_id = $2
      ON CONFLICT (project_id, name)
      DO UPDATE SET
        domain = EXCLUDED.domain,
        external_ref = EXCLUDED.external_ref,
        stage = EXCLUDED.stage,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId]
  );

  await pool.query(
    `
      INSERT INTO crm_opportunities(
        project_id,
        account_scope_id,
        account_id,
        title,
        stage,
        amount_estimate,
        probability,
        expected_close_date,
        next_step,
        owner_username,
        evidence_refs,
        updated_at
      )
      SELECT
        o.project_id,
        o.account_scope_id,
        a.id,
        COALESCE(o.title, o.external_id),
        CASE
          WHEN lower(COALESCE(o.stage, '')) IN ('won', 'closed-won') THEN 'won'
          WHEN lower(COALESCE(o.stage, '')) IN ('lost', 'closed-lost') THEN 'lost'
          WHEN lower(COALESCE(o.stage, '')) IN ('proposal', 'proposal_sent') THEN 'proposal'
          WHEN lower(COALESCE(o.stage, '')) IN ('negotiation') THEN 'negotiation'
          WHEN lower(COALESCE(o.stage, '')) IN ('qualified') THEN 'qualified'
          ELSE 'discovery'
        END,
        COALESCE(o.amount, 0),
        COALESCE(o.probability, 0.1),
        o.expected_close_date,
        COALESCE(o.next_step, 'Review next action'),
        NULL,
        '[]'::jsonb,
        now()
      FROM attio_opportunities_raw AS o
      JOIN crm_accounts AS a
        ON a.project_id = o.project_id
       AND a.account_scope_id = o.account_scope_id
       AND a.external_ref = o.account_external_id
      WHERE o.project_id = $1
        AND o.account_scope_id = $2
      ON CONFLICT DO NOTHING
    `,
    [scope.projectId, scope.accountScopeId]
  );
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

export async function runAttioSync(pool, scope, logger = console) {
  const fallbackWorkspaceId = String(process.env.ATTIO_WORKSPACE_ID || `auto-${String(scope.projectId).slice(0, 8)}`);
  const workspaceId = await resolveProjectSourceBinding(
    pool,
    scope,
    "attio_workspace",
    fallbackWorkspaceId,
    { source: "env_bootstrap" }
  );
  const source = `attio:${workspaceId}`;
  const config = {
    workspaceId,
    baseUrl: String(process.env.ATTIO_BASE_URL || "https://api.attio.com").replace(/\/+$/, ""),
    apiToken: String(process.env.ATTIO_API_TOKEN || "").trim(),
    mockMode: boolFromEnv(process.env.ATTIO_MOCK_MODE, !process.env.ATTIO_API_TOKEN),
    limit: toPositiveInt(process.env.ATTIO_SYNC_LIMIT, 200, 1, 1000),
  };

  const previousWatermark = await getWatermark(pool, scope, source);
  const snapshot = await loadAttioSnapshot(pool, scope, config, logger);

  const touchedAccounts = await upsertCompanies(pool, scope, snapshot.companies);
  const touchedOpportunities = await upsertOpportunities(pool, scope, snapshot.opportunities);
  const touchedPeople = await upsertPeople(pool, scope, snapshot.people || []);
  const touchedActivities = await upsertActivities(pool, scope, snapshot.activities || []);
  await mirrorToCrmTables(pool, scope);

  const cursor = computeCursor([
    ...snapshot.companies,
    ...snapshot.opportunities,
    ...(snapshot.people || []),
    ...(snapshot.activities || []),
  ]);
  await upsertWatermark(pool, scope, source, cursor.cursorTs, cursor.cursorId, {
    mode: snapshot.mode,
    touched_accounts: touchedAccounts,
    touched_opportunities: touchedOpportunities,
    touched_people: touchedPeople,
    touched_activities: touchedActivities,
    previous_cursor_ts: previousWatermark?.cursor_ts || null,
    synced_at: new Date().toISOString(),
  });

  return {
    source,
    mode: snapshot.mode,
    account_scope_id: scope.accountScopeId,
    project_id: scope.projectId,
    touched_accounts: touchedAccounts,
    touched_opportunities: touchedOpportunities,
    touched_people: touchedPeople,
    touched_activities: touchedActivities,
    cursor_ts: cursor.cursorTs,
    cursor_id: cursor.cursorId,
  };
}
