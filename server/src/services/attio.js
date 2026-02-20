import { fetchWithRetry } from "../lib/http.js";
import { toIsoTime, toPositiveInt } from "../lib/chunking.js";
import { resolveProjectSourceBinding } from "./sources.js";

function asText(value, maxLen = 1000) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLen) : null;
}

function toAmount(value) {
  if (value == null) return 0;
  const raw = typeof value === "string" ? value.replace(/[^0-9.,-]/g, "").replace(",", ".") : value;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function boolFromEnv(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function unwrapStructuredValue(value, depth = 0) {
  if (value == null || depth > 5) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = unwrapStructuredValue(item, depth + 1);
      if (extracted != null && extracted !== "") return extracted;
    }
    return null;
  }
  if (typeof value === "object") {
    const priorityKeys = [
      "value",
      "title",
      "name",
      "text",
      "display_value",
      "displayValue",
      "domain",
      "email",
      "amount",
      "currency_value",
      "currencyValue",
      "number",
      "date",
      "id",
      "record_id",
      "external_id",
      "target_record_id",
    ];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const extracted = unwrapStructuredValue(value[key], depth + 1);
        if (extracted != null && extracted !== "") return extracted;
      }
    }
    for (const nested of Object.values(value)) {
      const extracted = unwrapStructuredValue(nested, depth + 1);
      if (extracted != null && extracted !== "") return extracted;
    }
  }
  return null;
}

function pickRecordField(values, keys = []) {
  if (!values || typeof values !== "object") return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const extracted = unwrapStructuredValue(values[key]);
    if (extracted != null && extracted !== "") return extracted;
  }
  return null;
}

function extractRecordData(row) {
  if (row?.record && typeof row.record === "object") return row.record;
  if (row?.data && typeof row.data === "object") return row.data;
  return row || {};
}

function parseProbability(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function extractRelationExternalId(raw) {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    return asText(raw, 200);
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const extracted = extractRelationExternalId(item);
      if (extracted) return extracted;
    }
    return null;
  }
  if (typeof raw === "object") {
    const candidateKeys = ["target_record_id", "record_id", "external_id", "id", "value"];
    for (const key of candidateKeys) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const extracted = extractRelationExternalId(raw[key]);
      if (extracted) return extracted;
    }
    for (const nested of Object.values(raw)) {
      const extracted = extractRelationExternalId(nested);
      if (extracted) return extracted;
    }
  }
  return null;
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
  const record = extractRecordData(row);
  const externalId = asText(record?.id || record?.record_id || record?.company_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  const name = asText(
    pickRecordField(values, ["name", "company_name", "legal_name"]) || record?.name || row?.name,
    300
  );
  const domain = asText(
    pickRecordField(values, ["domain", "domains", "website", "company_domain"]) || record?.domain || row?.domain,
    300
  );
  const stage = asText(
    pickRecordField(values, ["stage", "account_stage", "lifecycle_stage"]) || record?.stage || row?.stage,
    100
  );
  const annualRevenue = toAmount(
    pickRecordField(values, ["annual_revenue", "revenue", "arr", "acv"]) ||
      record?.annual_revenue ||
      row?.annual_revenue
  );
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
  const record = extractRecordData(row);
  const externalId = asText(record?.id || record?.record_id || record?.deal_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  const title = asText(
    pickRecordField(values, ["name", "title", "deal_name", "opportunity_name"]) ||
      record?.name ||
      row?.name ||
      `Opportunity ${externalId}`,
    500
  );
  const stage = asText(
    pickRecordField(values, ["stage", "status", "deal_stage"]) || record?.stage || row?.stage,
    120
  ) || "discovery";
  const amount = toAmount(
    pickRecordField(values, ["amount", "amount_estimate", "value", "deal_value", "acv"]) ||
      record?.amount ||
      row?.amount
  );
  const probability =
    parseProbability(
      pickRecordField(values, ["probability", "win_probability", "likelihood"]) ||
        record?.probability ||
        row?.probability
    ) ?? 0.1;
  const expectedCloseDate = asText(
    pickRecordField(values, ["expected_close_date", "close_date", "target_close_date"]) ||
      record?.expected_close_date ||
      row?.expected_close_date,
    50
  );
  const accountExternalId = asText(
    extractRelationExternalId(
      pickRecordField(values, ["account_id", "account", "company_id", "company", "organization"])
    ) ||
      extractRelationExternalId(record?.account_id || row?.account_id || row?.company_id),
    200
  );
  const nextStep = asText(
    pickRecordField(values, ["next_step", "next_action", "next_task"]) || record?.next_step || row?.next_step,
    1000
  );
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
  const record = extractRecordData(row);
  const externalId = asText(record?.id || record?.record_id || record?.person_id || row?.id, 200);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  return {
    id: `attioperson:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    account_external_id: asText(
      extractRelationExternalId(
        pickRecordField(values, ["company_id", "company", "account_id", "account", "organization"])
      ) || extractRelationExternalId(record?.company_id || row?.company_id),
      200
    ),
    full_name: asText(pickRecordField(values, ["name", "full_name"]) || record?.name || row?.name, 300),
    email: asText(pickRecordField(values, ["email", "work_email"]) || record?.email || row?.email, 320),
    role: asText(pickRecordField(values, ["role", "job_title"]) || record?.role || row?.role, 200),
    data: record,
    updated_at: toIsoTime(record?.updated_at || row?.updated_at || record?.created_at || row?.created_at),
  };
}

function normalizeActivity(row, workspaceId) {
  const record = extractRecordData(row);
  const externalId = asText(record?.id || record?.record_id || record?.activity_id || row?.id, 220);
  if (!externalId) return null;
  const values = record?.values || record?.attributes || {};
  return {
    id: `attioact:${workspaceId}:${externalId}`,
    workspace_id: workspaceId,
    external_id: externalId,
    record_external_id: asText(
      extractRelationExternalId(
        pickRecordField(values, ["record_id", "record", "deal_id", "deal", "company_id", "company"])
      ) || extractRelationExternalId(record?.record_id || row?.record_id),
      220
    ),
    activity_type: asText(pickRecordField(values, ["type", "activity_type"]) || record?.type || row?.type, 120),
    note: asText(pickRecordField(values, ["note", "summary", "description"]) || record?.note || row?.note, 4000),
    actor_name: asText(
      pickRecordField(values, ["actor_name", "actor", "created_by"]) || record?.actor_name || row?.actor_name,
      250
    ),
    occurred_at: toIsoTime(
      pickRecordField(values, ["occurred_at", "created_at", "logged_at"]) ||
        record?.occurred_at ||
        row?.occurred_at ||
        row?.created_at
    ),
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

function buildEndpointWithQuery(endpoint, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  if (!queryString) return endpoint;
  return endpoint.includes("?") ? `${endpoint}&${queryString}` : `${endpoint}?${queryString}`;
}

function readNextCursor(payload) {
  return (
    payload?.pagination?.next_cursor ||
    payload?.pagination?.next ||
    payload?.meta?.next_cursor ||
    payload?.meta?.next ||
    payload?.next_cursor ||
    payload?.next ||
    payload?.cursor?.next ||
    null
  );
}

async function attioListPaginated(baseUrl, token, endpoint, limit, logger) {
  const maxPages = toPositiveInt(process.env.ATTIO_SYNC_MAX_PAGES, 50, 1, 500);
  const rows = [];
  const seenRecordIds = new Set();
  const seenCursors = new Set();
  let cursor = null;

  for (let page = 1; page <= maxPages; page++) {
    const payload = await attioGet(
      baseUrl,
      token,
      buildEndpointWithQuery(endpoint, { limit, cursor: cursor || undefined }),
      logger
    );
    const pageRows = pickArray(payload);
    for (const row of pageRows) {
      const record = extractRecordData(row);
      const rawId = asText(record?.id || record?.record_id || row?.id || row?.record_id, 300);
      const dedupeKey = rawId || JSON.stringify(row);
      if (seenRecordIds.has(dedupeKey)) continue;
      seenRecordIds.add(dedupeKey);
      rows.push(row);
    }
    const nextCursor = readNextCursor(payload);
    if (!nextCursor || !pageRows.length) break;
    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return rows;
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

  const [companyRows, opportunityRows] = await Promise.all([
    attioListPaginated(config.baseUrl, config.apiToken, "/v2/objects/companies/records", config.limit, logger),
    attioListPaginated(config.baseUrl, config.apiToken, "/v2/objects/deals/records", config.limit, logger),
  ]);
  let peopleRows = [];
  let activityRows = [];
  try {
    peopleRows = await attioListPaginated(
      config.baseUrl,
      config.apiToken,
      "/v2/objects/people/records",
      config.limit,
      logger
    );
  } catch (error) {
    logger.warn({ err: String(error?.message || error) }, "attio people endpoint unavailable, continuing");
  }
  try {
    activityRows = await attioListPaginated(config.baseUrl, config.apiToken, "/v2/activities", config.limit, logger);
  } catch (error) {
    logger.warn({ err: String(error?.message || error) }, "attio activities endpoint unavailable, continuing");
  }

  const companies = companyRows.map((row) => normalizeCompany(row, config.workspaceId)).filter(Boolean);
  const opportunities = opportunityRows.map((row) => normalizeOpportunity(row, config.workspaceId)).filter(Boolean);
  const people = peopleRows.map((row) => normalizePerson(row, config.workspaceId)).filter(Boolean);
  const activities = activityRows.map((row) => normalizeActivity(row, config.workspaceId)).filter(Boolean);

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
  const accountUpdateByExternalRef = await pool.query(
    `
      WITH src AS (
        SELECT DISTINCT ON (ar.external_id)
          ar.project_id,
          ar.account_scope_id,
          ar.external_id,
          COALESCE(NULLIF(ar.name, ''), ar.external_id) AS account_name,
          ar.domain,
          lower(COALESCE(ar.stage, '')) AS source_stage
        FROM attio_accounts_raw AS ar
        WHERE ar.project_id = $1
          AND ar.account_scope_id = $2
        ORDER BY ar.external_id, ar.updated_at DESC NULLS LAST
      )
      UPDATE crm_accounts AS a
      SET
        name = src.account_name,
        domain = src.domain,
        stage = CASE
          WHEN src.source_stage IN ('active', 'customer', 'won', 'closed-won') THEN 'active'
          WHEN src.source_stage IN ('inactive', 'churned', 'lost', 'closed-lost') THEN 'inactive'
          ELSE 'prospect'
        END,
        source_system = 'attio',
        updated_at = now()
      FROM src
      WHERE a.project_id = src.project_id
        AND a.account_scope_id = src.account_scope_id
        AND a.external_ref = src.external_id
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const accountAttachByName = await pool.query(
    `
      WITH src AS (
        SELECT DISTINCT ON (ar.external_id)
          ar.project_id,
          ar.account_scope_id,
          ar.external_id,
          COALESCE(NULLIF(ar.name, ''), ar.external_id) AS account_name,
          ar.domain,
          lower(COALESCE(ar.stage, '')) AS source_stage
        FROM attio_accounts_raw AS ar
        WHERE ar.project_id = $1
          AND ar.account_scope_id = $2
        ORDER BY ar.external_id, ar.updated_at DESC NULLS LAST
      )
      UPDATE crm_accounts AS a
      SET
        external_ref = src.external_id,
        domain = COALESCE(src.domain, a.domain),
        stage = CASE
          WHEN src.source_stage IN ('active', 'customer', 'won', 'closed-won') THEN 'active'
          WHEN src.source_stage IN ('inactive', 'churned', 'lost', 'closed-lost') THEN 'inactive'
          ELSE 'prospect'
        END,
        source_system = 'attio',
        updated_at = now()
      FROM src
      WHERE a.project_id = src.project_id
        AND a.account_scope_id = src.account_scope_id
        AND a.external_ref IS NULL
        AND lower(a.name) = lower(src.account_name)
        AND NOT EXISTS (
          SELECT 1
          FROM crm_accounts AS ax
          WHERE ax.project_id = a.project_id
            AND ax.external_ref = src.external_id
        )
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const accountInsert = await pool.query(
    `
      WITH src AS (
        SELECT DISTINCT ON (ar.external_id)
          ar.project_id,
          ar.account_scope_id,
          ar.external_id,
          COALESCE(NULLIF(ar.name, ''), ar.external_id) AS account_name,
          ar.domain,
          lower(COALESCE(ar.stage, '')) AS source_stage
        FROM attio_accounts_raw AS ar
        WHERE ar.project_id = $1
          AND ar.account_scope_id = $2
        ORDER BY ar.external_id, ar.updated_at DESC NULLS LAST
      )
      INSERT INTO crm_accounts(
        project_id,
        account_scope_id,
        name,
        domain,
        external_ref,
        stage,
        owner_username,
        source_system,
        updated_at
      )
      SELECT
        src.project_id,
        src.account_scope_id,
        src.account_name,
        src.domain,
        src.external_id,
        CASE
          WHEN src.source_stage IN ('active', 'customer', 'won', 'closed-won') THEN 'active'
          WHEN src.source_stage IN ('inactive', 'churned', 'lost', 'closed-lost') THEN 'inactive'
          ELSE 'prospect'
        END,
        NULL,
        'attio',
        now()
      FROM src
      WHERE NOT EXISTS (
        SELECT 1
        FROM crm_accounts AS a
        WHERE a.project_id = src.project_id
          AND (a.external_ref = src.external_id OR lower(a.name) = lower(src.account_name))
      )
      ON CONFLICT (project_id, external_ref)
      DO UPDATE SET
        name = EXCLUDED.name,
        domain = EXCLUDED.domain,
        stage = EXCLUDED.stage,
        source_system = EXCLUDED.source_system,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const opportunityUpsert = await pool.query(
    `
      WITH src AS (
        SELECT DISTINCT ON (o.external_id)
          o.project_id,
          o.account_scope_id,
          o.external_id,
          o.account_external_id,
          COALESCE(NULLIF(o.title, ''), o.external_id) AS title,
          lower(COALESCE(o.stage, '')) AS source_stage,
          COALESCE(o.amount, 0) AS amount,
          LEAST(1, GREATEST(0, COALESCE(o.probability, 0.1))) AS probability,
          o.expected_close_date,
          COALESCE(NULLIF(o.next_step, ''), 'Review next action') AS next_step
        FROM attio_opportunities_raw AS o
        WHERE o.project_id = $1
          AND o.account_scope_id = $2
        ORDER BY o.external_id, o.updated_at DESC NULLS LAST
      ),
      resolved AS (
        SELECT
          src.project_id,
          src.account_scope_id,
          a.id AS account_id,
          src.external_id,
          src.title,
          src.source_stage,
          src.amount,
          src.probability,
          src.expected_close_date,
          src.next_step
        FROM src
        JOIN crm_accounts AS a
          ON a.project_id = src.project_id
         AND a.account_scope_id = src.account_scope_id
         AND a.external_ref = src.account_external_id
      )
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
        external_ref,
        source_system,
        updated_at
      )
      SELECT
        r.project_id,
        r.account_scope_id,
        r.account_id,
        r.title,
        CASE
          WHEN r.source_stage IN ('won', 'closed-won') THEN 'won'
          WHEN r.source_stage IN ('lost', 'closed-lost') THEN 'lost'
          WHEN r.source_stage IN ('proposal', 'proposal_sent') THEN 'proposal'
          WHEN r.source_stage IN ('negotiation') THEN 'negotiation'
          WHEN r.source_stage IN ('qualified') THEN 'qualified'
          ELSE 'discovery'
        END,
        r.amount,
        r.probability,
        r.expected_close_date,
        r.next_step,
        NULL,
        '[]'::jsonb,
        r.external_id,
        'attio',
        now()
      FROM resolved AS r
      ON CONFLICT (project_id, external_ref)
      DO UPDATE SET
        account_id = EXCLUDED.account_id,
        title = EXCLUDED.title,
        stage = EXCLUDED.stage,
        amount_estimate = EXCLUDED.amount_estimate,
        probability = EXCLUDED.probability,
        expected_close_date = EXCLUDED.expected_close_date,
        next_step = EXCLUDED.next_step,
        source_system = EXCLUDED.source_system,
        updated_at = now()
    `,
    [scope.projectId, scope.accountScopeId]
  );

  const [coverageRows, gapRows] = await Promise.all([
    pool.query(
      `
        SELECT
          (SELECT count(*)::int
            FROM (
              SELECT DISTINCT external_id
              FROM attio_accounts_raw
              WHERE project_id = $1
                AND account_scope_id = $2
            ) AS t
          ) AS total_attio_accounts,
          (SELECT count(*)::int
            FROM crm_accounts
            WHERE project_id = $1
              AND account_scope_id = $2
              AND source_system = 'attio'
              AND external_ref IS NOT NULL
          ) AS mirrored_accounts,
          (SELECT count(*)::int
            FROM (
              SELECT DISTINCT external_id
              FROM attio_opportunities_raw
              WHERE project_id = $1
                AND account_scope_id = $2
            ) AS t
          ) AS total_attio_opportunities,
          (SELECT count(*)::int
            FROM crm_opportunities
            WHERE project_id = $1
              AND account_scope_id = $2
              AND source_system = 'attio'
              AND external_ref IS NOT NULL
          ) AS mirrored_opportunities
      `,
      [scope.projectId, scope.accountScopeId]
    ),
    pool.query(
      `
        WITH latest_opps AS (
          SELECT DISTINCT ON (o.external_id)
            o.external_id,
            o.account_external_id
          FROM attio_opportunities_raw AS o
          WHERE o.project_id = $1
            AND o.account_scope_id = $2
          ORDER BY o.external_id, o.updated_at DESC NULLS LAST
        )
        SELECT
          count(*) FILTER (WHERE lo.account_external_id IS NULL)::int AS opportunities_without_account_ref,
          count(*) FILTER (
            WHERE lo.account_external_id IS NOT NULL
              AND a.id IS NULL
          )::int AS opportunities_unmapped_to_crm_account
        FROM latest_opps AS lo
        LEFT JOIN crm_accounts AS a
          ON a.project_id = $1
         AND a.account_scope_id = $2
         AND a.external_ref = lo.account_external_id
      `,
      [scope.projectId, scope.accountScopeId]
    ),
  ]);

  const coverage = coverageRows.rows[0] || {};
  const gaps = gapRows.rows[0] || {};
  return {
    touched_accounts:
      (accountUpdateByExternalRef.rowCount || 0) +
      (accountAttachByName.rowCount || 0) +
      (accountInsert.rowCount || 0),
    touched_opportunities: opportunityUpsert.rowCount || 0,
    coverage: {
      total_attio_accounts: Number(coverage.total_attio_accounts || 0),
      mirrored_accounts: Number(coverage.mirrored_accounts || 0),
      total_attio_opportunities: Number(coverage.total_attio_opportunities || 0),
      mirrored_opportunities: Number(coverage.mirrored_opportunities || 0),
      opportunities_without_account_ref: Number(gaps.opportunities_without_account_ref || 0),
      opportunities_unmapped_to_crm_account: Number(gaps.opportunities_unmapped_to_crm_account || 0),
    },
  };
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
    mockMode: boolFromEnv(process.env.ATTIO_MOCK_MODE, false),
    limit: toPositiveInt(process.env.ATTIO_SYNC_LIMIT, 200, 1, 1000),
  };
  if (!config.apiToken && !config.mockMode) {
    throw new Error("attio_api_token_missing_or_enable_mock_mode");
  }

  const previousWatermark = await getWatermark(pool, scope, source);
  const snapshot = await loadAttioSnapshot(pool, scope, config, logger);

  // Wrap all DB writes + watermark in a transaction so the watermark
  // only advances when every upsert has been committed.
  const client = await pool.connect();
  let touchedAccounts, touchedOpportunities, touchedPeople, touchedActivities, mirrorResult, cursor;
  try {
    await client.query("BEGIN");

    touchedAccounts = await upsertCompanies(client, scope, snapshot.companies);
    touchedOpportunities = await upsertOpportunities(client, scope, snapshot.opportunities);
    touchedPeople = await upsertPeople(client, scope, snapshot.people || []);
    touchedActivities = await upsertActivities(client, scope, snapshot.activities || []);
    mirrorResult = await mirrorToCrmTables(client, scope);

    cursor = computeCursor([
      ...snapshot.companies,
      ...snapshot.opportunities,
      ...(snapshot.people || []),
      ...(snapshot.activities || []),
    ]);
    await upsertWatermark(client, scope, source, cursor.cursorTs, cursor.cursorId, {
      mode: snapshot.mode,
      touched_accounts: touchedAccounts,
      touched_opportunities: touchedOpportunities,
      touched_people: touchedPeople,
      touched_activities: touchedActivities,
      mirrored_crm_accounts: mirrorResult.touched_accounts,
      mirrored_crm_opportunities: mirrorResult.touched_opportunities,
      coverage: mirrorResult.coverage,
      previous_cursor_ts: previousWatermark?.cursor_ts || null,
      synced_at: new Date().toISOString(),
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    source,
    mode: snapshot.mode,
    account_scope_id: scope.accountScopeId,
    project_id: scope.projectId,
    touched_accounts: touchedAccounts,
    touched_opportunities: touchedOpportunities,
    touched_people: touchedPeople,
    touched_activities: touchedActivities,
    mirrored_crm_accounts: mirrorResult.touched_accounts,
    mirrored_crm_opportunities: mirrorResult.touched_opportunities,
    coverage: mirrorResult.coverage,
    cursor_ts: cursor.cursorTs,
    cursor_id: cursor.cursorId,
  };
}
