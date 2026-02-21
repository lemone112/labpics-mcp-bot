import { fail } from "../../infra/api-contract.js";
import { writeAuditEvent } from "../core/audit.js";
import { toPositiveInt } from "../../infra/utils.js";
import type { Pool } from "../../types/index.js";

const DEFAULT_LOOPS_API_BASE = "https://app.loops.so/api/v1";

interface LoopsScopeInput {
  accountScopeId?: string | null;
  projectIds?: string[] | null;
}

interface SyncLoopsOptions {
  actorUsername?: string | null;
  requestId?: string | null;
  limit?: unknown;
}

interface LoopsContactPayload {
  email: string;
  name: string;
  project_ids: string[];
  project_names: string[];
}

function uniqueIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<string>();
  for (const item of input) {
    const id = String(item || "").trim();
    if (!id) continue;
    set.add(id);
    if (set.size >= 100) break;
  }
  return Array.from(set);
}

function isDuplicateContactError(message: unknown): boolean {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("exists") ||
    normalized.includes("already") ||
    normalized.includes("duplicate") ||
    normalized.includes("conflict")
  );
}

async function readJsonSafe(response: { text: () => Promise<string> }): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function loopsRequest(path: string, payload: unknown, apiKey: string): Promise<unknown> {
  const baseUrl = String(process.env.LOOPS_API_BASE_URL || DEFAULT_LOOPS_API_BASE).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload || {}),
  });

  const body = await readJsonSafe(response);
  if (!response.ok) {
    const details = body && typeof body === "object" ? JSON.stringify(body) : String(body || "");
    throw new Error(`loops_http_${response.status}${details ? `: ${details}` : ""}`);
  }

  return body;
}

async function upsertLoopsContact(contact: LoopsContactPayload, apiKey: string): Promise<{ status: "created" | "updated" }> {
  const payload = {
    email: contact.email,
    firstName: contact.name,
    source: "labpics-dashboard",
    projectIds: contact.project_ids,
    projectNames: contact.project_names,
  };

  try {
    await loopsRequest("/contacts/create", payload, apiKey);
    return { status: "created" };
  } catch (error) {
    if (!isDuplicateContactError((error as Error)?.message)) {
      throw error;
    }
  }

  await loopsRequest("/contacts/update", payload, apiKey);
  return { status: "updated" };
}

async function resolveScopedProjectIds(
  pool: Pool,
  accountScopeId: string,
  requestedProjectIds: unknown = []
): Promise<string[]> {
  const requested = uniqueIds(requestedProjectIds);
  const hasFilter = requested.length > 0;
  const query = hasFilter
    ? `
      SELECT id::text AS id
      FROM projects
      WHERE account_scope_id = $1
        AND id::text = ANY($2::text[])
      ORDER BY created_at DESC
    `
    : `
      SELECT id::text AS id
      FROM projects
      WHERE account_scope_id = $1
      ORDER BY created_at DESC
    `;
  const values = hasFilter ? [accountScopeId, requested] : [accountScopeId];
  const { rows } = await pool.query<{ id: string }>(query, values);
  return rows.map((row) => row.id);
}

export async function syncLoopsContacts(
  pool: Pool,
  scope: LoopsScopeInput,
  options: SyncLoopsOptions = {}
): Promise<{
  enabled: boolean;
  reason?: string;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  errors: Array<{ email: string; message: string }>;
  selected_project_ids?: string[];
}> {
  const accountScopeId = String(scope?.accountScopeId || "");
  if (!accountScopeId) {
    fail(409, "account_scope_required", "Account scope is required for Loops sync");
  }

  const apiKey = String(process.env.LOOPS_SECRET_KEY || "").trim();
  if (!apiKey) {
    return {
      enabled: false,
      reason: "LOOPS_SECRET_KEY is not configured",
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
  }

  const selectedProjectIds = await resolveScopedProjectIds(pool, accountScopeId, scope?.projectIds || []);
  if (!selectedProjectIds.length) {
    return {
      enabled: true,
      processed: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      selected_project_ids: [],
    };
  }

  const limit = toPositiveInt(options.limit, 300, 1, 5000);
  const contactsResult = await pool.query<{
    email: string | null;
    name: string | null;
    project_ids: string[] | null;
    project_names: string[] | null;
  }>(
    `
      SELECT
        lower(c.email) AS email,
        COALESCE(NULLIF(btrim(c.name), ''), split_part(lower(c.email), '@', 1)) AS name,
        array_agg(DISTINCT c.project_id::text) AS project_ids,
        array_agg(DISTINCT p.name) AS project_names
      FROM cw_contacts AS c
      JOIN projects AS p ON p.id = c.project_id
      WHERE c.account_scope_id = $1
        AND c.project_id::text = ANY($2::text[])
        AND c.email IS NOT NULL
        AND btrim(c.email) <> ''
      GROUP BY lower(c.email)
      ORDER BY lower(c.email)
      LIMIT $3
    `,
    [accountScopeId, selectedProjectIds, limit]
  );

  let processed = 0;
  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ email: string; message: string }> = [];

  for (const contact of contactsResult.rows) {
    const email = String(contact.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      skipped += 1;
      continue;
    }
    try {
      const result = await upsertLoopsContact(
        {
          email,
          name: String(contact.name || "").trim() || email.split("@")[0],
          project_ids: Array.isArray(contact.project_ids) ? contact.project_ids : [],
          project_names: Array.isArray(contact.project_names) ? contact.project_names : [],
        },
        apiKey
      );
      processed += 1;
      if (result.status === "created") created += 1;
      if (result.status === "updated") updated += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        email,
        message: String((error as Error)?.message || "loops_sync_failed").slice(0, 300),
      });
      if (errors.length > 20) {
        errors.length = 20;
      }
    }
  }

  const auditStatus = failed > 0 ? (processed > 0 ? "partial" : "failed") : "ok";
  for (const projectId of selectedProjectIds) {
    await writeAuditEvent(pool, {
      projectId,
      accountScopeId,
      actorUsername: options.actorUsername || null,
      action: "loops.contacts_sync",
      entityType: "integration",
      entityId: "loops",
      status: auditStatus,
      requestId: options.requestId || null,
      payload: {
        selected_project_ids: selectedProjectIds,
        processed,
        created,
        updated,
        failed,
        skipped,
      },
      evidenceRefs: [],
    });
  }

  return {
    enabled: true,
    selected_project_ids: selectedProjectIds,
    processed,
    created,
    updated,
    failed,
    skipped,
    errors,
  };
}
