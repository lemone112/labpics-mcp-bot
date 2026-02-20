import { fail } from "../../infra/api-contract.js";

const MAX_EVIDENCE_REFS = 50;

function inferSourceTable(ref) {
  const value = String(ref || "");
  if (value.startsWith("cwmsg:")) return "cw_messages";
  if (value.startsWith("cw:")) return "cw_conversations";
  if (value.startsWith("cwc:")) return "cw_contacts";
  if (value.length === 36) return "rag_chunks";
  return "external";
}

function normalizeEvidenceRef(value) {
  if (typeof value === "string") {
    return {
      source: inferSourceTable(value),
      ref: value.trim(),
      snippet: null,
      meta: {},
    };
  }
  if (!value || typeof value !== "object") return null;

  const ref = String(value.ref || value.source_ref || value.id || "").trim();
  if (!ref) return null;
  const source = String(value.source || value.source_type || inferSourceTable(ref)).trim().toLowerCase();
  const snippet = value.snippet == null ? null : String(value.snippet).slice(0, 1000);
  const meta = value.meta && typeof value.meta === "object" ? value.meta : {};
  return {
    source,
    ref,
    snippet,
    meta,
  };
}

export function normalizeEvidenceRefs(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    fail(400, "invalid_evidence_refs", "evidence_refs must be an array");
  }

  const dedupe = new Set();
  const out = [];
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

export async function indexEvidenceRefs(pool, scope, refs) {
  if (!refs.length) return 0;
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

export async function writeAuditEvent(pool, event) {
  const evidenceRefs = normalizeEvidenceRefs(event?.evidenceRefs);
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const status = String(event?.status || "ok");
  const { rows } = await pool.query(
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
      RETURNING id, created_at
    `,
    [
      event.projectId,
      event.accountScopeId,
      event.actorUsername || null,
      event.actorUserId || null,
      String(event.action || "unknown_action").slice(0, 200),
      event.entityType || null,
      event.entityId || null,
      status.slice(0, 50),
      event.requestId || null,
      event.idempotencyKey || null,
      JSON.stringify(payload),
      JSON.stringify(evidenceRefs),
    ]
  );

  await indexEvidenceRefs(
    pool,
    { projectId: event.projectId, accountScopeId: event.accountScopeId },
    evidenceRefs
  );
  return rows[0];
}

export async function listAuditEvents(pool, scope, options = {}) {
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
  return rows;
}
