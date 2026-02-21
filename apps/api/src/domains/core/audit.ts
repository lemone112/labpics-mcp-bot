import { fail } from "../../infra/api-contract.js";
import type { Pool, ProjectScope } from "../../types/index.js";

const MAX_EVIDENCE_REFS = 50;

type JsonObject = Record<string, unknown>;

interface NormalizedEvidenceRef {
  source: string;
  ref: string;
  snippet: string | null;
  meta: JsonObject;
}

interface AuditEventInput {
  projectId: unknown;
  accountScopeId: unknown;
  actorUsername?: unknown;
  actorUserId?: unknown;
  action?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  status?: unknown;
  requestId?: unknown;
  idempotencyKey?: unknown;
  payload?: unknown;
  evidenceRefs?: unknown;
}

interface AuditListOptions {
  limit?: number | string;
  offset?: number | string;
  action?: string | null;
}

interface LooseProjectScope {
  projectId: string | null;
  accountScopeId: string | null;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object") return null;
  return value as JsonObject;
}

function toNullableText(value: unknown, max = 1_000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function inferSourceTable(ref: string): string {
  const value = String(ref || "");
  if (value.startsWith("cwmsg:")) return "cw_messages";
  if (value.startsWith("cw:")) return "cw_conversations";
  if (value.startsWith("cwc:")) return "cw_contacts";
  if (value.length === 36) return "rag_chunks";
  return "external";
}

function normalizeEvidenceRef(value: unknown): NormalizedEvidenceRef | null {
  if (typeof value === "string") {
    return {
      source: inferSourceTable(value),
      ref: value.trim(),
      snippet: null,
      meta: {},
    };
  }

  const objectValue = asObject(value);
  if (!objectValue) return null;

  const ref = String(objectValue.ref || objectValue.source_ref || objectValue.id || "").trim();
  if (!ref) return null;
  const source = String(objectValue.source || objectValue.source_type || inferSourceTable(ref))
    .trim()
    .toLowerCase();
  const snippet = objectValue.snippet == null ? null : String(objectValue.snippet).slice(0, 1000);
  const meta = asObject(objectValue.meta) || {};
  return {
    source,
    ref,
    snippet,
    meta,
  };
}

export function normalizeEvidenceRefs(input: unknown): NormalizedEvidenceRef[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    fail(400, "invalid_evidence_refs", "evidence_refs must be an array");
  }

  const dedupe = new Set<string>();
  const out: NormalizedEvidenceRef[] = [];
  for (const item of input) {
    const normalized = normalizeEvidenceRef(item);
    if (!normalized) continue;
    const key = `${normalized.source}:${normalized.ref}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    out.push(normalized);
    if (out.length >= MAX_EVIDENCE_REFS) break;
  }
  return out;
}

export async function indexEvidenceRefs(
  pool: Pool,
  scope: LooseProjectScope,
  refs: NormalizedEvidenceRef[]
): Promise<number> {
  if (!refs.length) return 0;
  if (!scope.projectId || !scope.accountScopeId) return 0;
  const payload = refs.map((row) => ({
    project_id: scope.projectId,
    account_scope_id: scope.accountScopeId,
    source_type: row.source,
    source_table: inferSourceTable(row.ref),
    source_pk: row.ref,
    conversation_global_id: row.ref.startsWith("cw:") ? row.ref : null,
    message_global_id: row.ref.startsWith("cwmsg:") ? row.ref : null,
    contact_global_id: row.ref.startsWith("cwc:") ? row.ref : null,
    snippet: row.snippet,
    payload: row.meta || {},
  }));

  const result = await pool.query(
    `
      INSERT INTO evidence_items(
        project_id,
        account_scope_id,
        source_type,
        source_table,
        source_pk,
        conversation_global_id,
        message_global_id,
        contact_global_id,
        snippet,
        payload
      )
      SELECT
        x.project_id,
        x.account_scope_id,
        x.source_type,
        x.source_table,
        x.source_pk,
        x.conversation_global_id,
        x.message_global_id,
        x.contact_global_id,
        x.snippet,
        x.payload
      FROM jsonb_to_recordset($1::jsonb) AS x(
        project_id uuid,
        account_scope_id uuid,
        source_type text,
        source_table text,
        source_pk text,
        conversation_global_id text,
        message_global_id text,
        contact_global_id text,
        snippet text,
        payload jsonb
      )
      ON CONFLICT (project_id, source_table, source_pk)
      DO UPDATE SET
        source_type = EXCLUDED.source_type,
        snippet = COALESCE(EXCLUDED.snippet, evidence_items.snippet),
        payload = COALESCE(EXCLUDED.payload, evidence_items.payload)
    `,
    [JSON.stringify(payload)]
  );
  return result.rowCount || 0;
}

export async function writeAuditEvent(
  pool: Pool,
  event: AuditEventInput
): Promise<{ id: string; created_at: string }> {
  const evidenceRefs = normalizeEvidenceRefs(event?.evidenceRefs);
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const status = String(event?.status || "ok");
  const projectId = toNullableText(event.projectId, 64);
  const accountScopeId = toNullableText(event.accountScopeId, 64);
  const { rows } = await pool.query<{ id: string; created_at: string }>(
    `
      INSERT INTO audit_events(
        project_id,
        account_scope_id,
        actor_username,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        status,
        request_id,
        idempotency_key,
        payload,
        evidence_refs
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      RETURNING id, created_at::text
    `,
    [
      projectId,
      accountScopeId,
      toNullableText(event.actorUsername, 200),
      toNullableText(event.actorUserId, 64),
      String(event.action || "unknown_action").slice(0, 200),
      toNullableText(event.entityType, 200),
      toNullableText(event.entityId, 200),
      status.slice(0, 50),
      toNullableText(event.requestId, 200),
      toNullableText(event.idempotencyKey, 200),
      JSON.stringify(payload),
      JSON.stringify(evidenceRefs),
    ]
  );

  await indexEvidenceRefs(pool, { projectId, accountScopeId }, evidenceRefs);
  if (!rows[0]) {
    fail(500, "audit_write_failed", "Failed to write audit event");
  }
  return rows[0];
}

export async function listAuditEvents(
  pool: Pool,
  scope: ProjectScope,
  options: AuditListOptions = {}
): Promise<Record<string, unknown>[]> {
  const limitRaw = Number.parseInt(String(options.limit || "50"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const offsetRaw = Number.parseInt(String(options.offset || "0"), 10);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  const action = String(options.action || "").trim();

  const query = action
    ? `
      SELECT id, actor_username, actor_user_id, action, entity_type, entity_id, status, request_id, payload, evidence_refs, created_at
      FROM audit_events
      WHERE project_id = $1
        AND account_scope_id = $2
        AND action = $3
      ORDER BY created_at DESC
      LIMIT $4
      OFFSET $5
    `
    : `
      SELECT id, actor_username, actor_user_id, action, entity_type, entity_id, status, request_id, payload, evidence_refs, created_at
      FROM audit_events
      WHERE project_id = $1
        AND account_scope_id = $2
      ORDER BY created_at DESC
      LIMIT $3
      OFFSET $4
    `;

  const values = action
    ? [scope.projectId, scope.accountScopeId, action, limit, offset]
    : [scope.projectId, scope.accountScopeId, limit, offset];
  const { rows } = await pool.query(query, values);
  return rows as Record<string, unknown>[];
}
