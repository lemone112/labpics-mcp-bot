export const KAG_NODE_TYPES = Object.freeze([
  "project",
  "client",
  "person",
  "stage",
  "deliverable",
  "conversation",
  "message",
  "task",
  "blocker",
  "deal",
  "finance_entry",
  "agreement",
  "decision",
  "risk",
  "offer",
]);

export const KAG_EVENT_TYPES = Object.freeze([
  "message_sent",
  "decision_made",
  "agreement_created",
  "approval_approved",
  "stage_started",
  "stage_completed",
  "task_created",
  "task_blocked",
  "blocker_resolved",
  "deal_updated",
  "finance_entry_created",
  "risk_detected",
  "scope_change_requested",
  "need_detected",
  "offer_created",
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value, max = 500) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function normalizeEvidenceRef(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = {
    message_id: item.message_id ? cleanText(item.message_id, 200) : null,
    linear_issue_id: item.linear_issue_id ? cleanText(item.linear_issue_id, 200) : null,
    attio_record_id: item.attio_record_id ? cleanText(item.attio_record_id, 200) : null,
    doc_url: item.doc_url ? cleanText(item.doc_url, 2000) : null,
    rag_chunk_id: item.rag_chunk_id ? cleanText(item.rag_chunk_id, 200) : null,
    source_table: item.source_table ? cleanText(item.source_table, 200) : null,
    source_pk: item.source_pk ? cleanText(item.source_pk, 500) : null,
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
  };
  if (
    !normalized.message_id &&
    !normalized.linear_issue_id &&
    !normalized.attio_record_id &&
    !normalized.doc_url &&
    !normalized.rag_chunk_id
  ) {
    return null;
  }
  return normalized;
}

function dedupeEvidence(refs = [], limit = 50) {
  const out = [];
  const seen = new Set();
  for (const item of refs) {
    const normalized = normalizeEvidenceRef(item);
    if (!normalized) continue;
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function inferSourceKind(ref) {
  if (ref.message_id) return "chatwoot_message";
  if (ref.linear_issue_id) return "linear_issue";
  if (ref.attio_record_id) return "attio_record";
  if (ref.doc_url) return "document";
  if (ref.rag_chunk_id) return "rag_chunk";
  return "manual";
}

export function buildGraphNode(input = {}) {
  return {
    node_type: cleanText(input.node_type, 60).toLowerCase(),
    node_key: cleanText(input.node_key || input.id, 400),
    status: cleanText(input.status || "active", 30).toLowerCase(),
    title: cleanText(input.title, 500) || null,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    numeric_fields: input.numeric_fields && typeof input.numeric_fields === "object" ? input.numeric_fields : {},
    source_refs: dedupeEvidence(input.source_refs || [], 30),
    rag_chunk_refs: toArray(input.rag_chunk_refs).map((row) => String(row)).slice(0, 30),
  };
}

export function buildGraphEdge(input = {}) {
  const fromNodeId = cleanText(input.from_node_id, 200);
  const toNodeId = cleanText(input.to_node_id, 200);
  const fromNodeRef = cleanText(input.from_node_ref, 260);
  const toNodeRef = cleanText(input.to_node_ref, 260);
  return {
    from_node_id: fromNodeId || null,
    to_node_id: toNodeId || null,
    from_node_ref: fromNodeRef || null,
    to_node_ref: toNodeRef || null,
    relation_type: cleanText(input.relation_type, 80).toLowerCase(),
    status: cleanText(input.status || "active", 30).toLowerCase(),
    weight: Number.isFinite(Number(input.weight)) ? Number(input.weight) : 1,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    source_refs: dedupeEvidence(input.source_refs || [], 30),
    rag_chunk_refs: toArray(input.rag_chunk_refs).map((row) => String(row)).slice(0, 30),
  };
}

export function buildGraphEvent(input = {}) {
  const eventType = cleanText(input.event_type, 80).toLowerCase();
  const eventTs = input.event_ts || input.occurred_at || new Date().toISOString();
  const actorNodeId = cleanText(input.actor_node_id, 200);
  const subjectNodeId = cleanText(input.subject_node_id, 200);
  const actorNodeRef = cleanText(input.actor_node_ref, 260);
  const subjectNodeRef = cleanText(input.subject_node_ref, 260);
  return {
    event_type: eventType,
    event_ts: new Date(eventTs).toISOString(),
    actor_node_id: actorNodeId || null,
    subject_node_id: subjectNodeId || null,
    actor_node_ref: actorNodeRef || null,
    subject_node_ref: subjectNodeRef || null,
    status: cleanText(input.status || "open", 30).toLowerCase(),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    source_refs: dedupeEvidence(input.source_refs || input.evidence_refs || [], 30),
    rag_chunk_refs: toArray(input.rag_chunk_refs).map((row) => String(row)).slice(0, 30),
  };
}

export function buildProvenanceRows({ objectKind, objectId, refs = [] }) {
  const evidenceRefs = dedupeEvidence(refs, 60);
  return evidenceRefs.map((ref) => ({
    object_kind: objectKind,
    object_id: String(objectId),
    source_kind: inferSourceKind(ref),
    message_id: ref.message_id,
    linear_issue_id: ref.linear_issue_id,
    attio_record_id: ref.attio_record_id,
    doc_url: ref.doc_url,
    rag_chunk_id: ref.rag_chunk_id,
    source_table: ref.source_table,
    source_pk: ref.source_pk,
    metadata: ref.metadata || {},
  }));
}

export async function upsertGraphNodes(pool, scope, nodes = []) {
  const payload = nodes.map((node) => buildGraphNode(node)).filter((node) => node.node_type && node.node_key);
  if (!payload.length) return [];
  const { rows } = await pool.query(
    `
      INSERT INTO kag_nodes(
        project_id,
        account_scope_id,
        node_type,
        node_key,
        status,
        title,
        payload,
        numeric_fields,
        source_refs,
        rag_chunk_refs,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.node_type,
        x.node_key,
        x.status,
        x.title,
        x.payload,
        x.numeric_fields,
        x.source_refs,
        x.rag_chunk_refs,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        node_type text,
        node_key text,
        status text,
        title text,
        payload jsonb,
        numeric_fields jsonb,
        source_refs jsonb,
        rag_chunk_refs jsonb
      )
      ON CONFLICT (project_id, node_type, node_key)
      DO UPDATE SET
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        payload = EXCLUDED.payload,
        numeric_fields = EXCLUDED.numeric_fields,
        source_refs = EXCLUDED.source_refs,
        rag_chunk_refs = EXCLUDED.rag_chunk_refs,
        updated_at = now()
      RETURNING id, node_type, node_key, status, title, source_refs, rag_chunk_refs
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return rows;
}

export async function upsertGraphEdges(pool, scope, edges = []) {
  const payload = edges
    .map((edge) => buildGraphEdge(edge))
    .filter((edge) => edge.from_node_id && edge.to_node_id && edge.relation_type);
  if (!payload.length) return [];
  const { rows } = await pool.query(
    `
      INSERT INTO kag_edges(
        project_id,
        account_scope_id,
        from_node_id,
        to_node_id,
        relation_type,
        status,
        weight,
        payload,
        source_refs,
        rag_chunk_refs,
        updated_at
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.from_node_id::uuid,
        x.to_node_id::uuid,
        x.relation_type,
        x.status,
        x.weight,
        x.payload,
        x.source_refs,
        x.rag_chunk_refs,
        now()
      FROM jsonb_to_recordset($3::jsonb) AS x(
        from_node_id text,
        to_node_id text,
        relation_type text,
        status text,
        weight numeric,
        payload jsonb,
        source_refs jsonb,
        rag_chunk_refs jsonb
      )
      ON CONFLICT (project_id, from_node_id, to_node_id, relation_type)
      DO UPDATE SET
        status = EXCLUDED.status,
        weight = EXCLUDED.weight,
        payload = EXCLUDED.payload,
        source_refs = EXCLUDED.source_refs,
        rag_chunk_refs = EXCLUDED.rag_chunk_refs,
        updated_at = now()
      RETURNING id, from_node_id, to_node_id, relation_type, status, source_refs, rag_chunk_refs
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return rows;
}

export async function insertGraphEvents(pool, scope, events = []) {
  const payload = events.map((event) => buildGraphEvent(event)).filter((event) => event.event_type);
  if (!payload.length) return [];
  const { rows } = await pool.query(
    `
      INSERT INTO kag_events(
        project_id,
        account_scope_id,
        event_type,
        event_ts,
        actor_node_id,
        subject_node_id,
        status,
        payload,
        source_refs,
        rag_chunk_refs
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.event_type,
        x.event_ts::timestamptz,
        NULLIF(x.actor_node_id, '')::uuid,
        NULLIF(x.subject_node_id, '')::uuid,
        x.status,
        x.payload,
        x.source_refs,
        x.rag_chunk_refs
      FROM jsonb_to_recordset($3::jsonb) AS x(
        event_type text,
        event_ts text,
        actor_node_id text,
        subject_node_id text,
        status text,
        payload jsonb,
        source_refs jsonb,
        rag_chunk_refs jsonb
      )
      RETURNING id, event_type, event_ts, status, source_refs, rag_chunk_refs
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(payload)]
  );
  return rows;
}

export async function insertProvenanceRefs(pool, scope, refs = []) {
  const normalized = refs
    .flatMap((item) =>
      buildProvenanceRows({
        objectKind: item.object_kind,
        objectId: item.object_id,
        refs: item.refs || [],
      })
    )
    .filter((row) => row.object_kind && row.object_id);
  if (!normalized.length) return 0;

  const result = await pool.query(
    `
      INSERT INTO kag_provenance_refs(
        project_id,
        account_scope_id,
        object_kind,
        object_id,
        source_kind,
        message_id,
        linear_issue_id,
        attio_record_id,
        doc_url,
        rag_chunk_id,
        source_table,
        source_pk,
        metadata
      )
      SELECT
        $1::uuid,
        $2::uuid,
        x.object_kind,
        x.object_id,
        x.source_kind,
        x.message_id,
        x.linear_issue_id,
        x.attio_record_id,
        x.doc_url,
        NULLIF(x.rag_chunk_id, '')::uuid,
        x.source_table,
        x.source_pk,
        x.metadata
      FROM jsonb_to_recordset($3::jsonb) AS x(
        object_kind text,
        object_id text,
        source_kind text,
        message_id text,
        linear_issue_id text,
        attio_record_id text,
        doc_url text,
        rag_chunk_id text,
        source_table text,
        source_pk text,
        metadata jsonb
      )
      ON CONFLICT DO NOTHING
    `,
    [scope.projectId, scope.accountScopeId, JSON.stringify(normalized)]
  );
  return result.rowCount || 0;
}
