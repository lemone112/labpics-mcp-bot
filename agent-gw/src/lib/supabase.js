// @ts-nocheck

import { safeJson } from "./util.js";
import { requireEnv } from "./security.js";
import { openaiEmbedding } from "./openai.js";

export function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

export async function fetchRecentChunks(env, { project_id, limit = 80 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "agent-gw");

  const url =
    `${env.SUPABASE_URL}/rest/v1/rag_chunks` +
    `?select=chunk_id,conversation_global_id,text,created_at` +
    `&project_id=eq.${encodeURIComponent(project_id)}` +
    `&order=created_at.desc` +
    `&limit=${limit}`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders(env) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase rag_chunks ${res.status}: ${txt}`);

  const data = safeJson(txt);
  return Array.isArray(data) ? data : [];
}

export async function listCommitments(env, { project_id, limit = 10 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "agent-gw");

  const url =
    `${env.SUPABASE_URL}/rest/v1/project_commitments` +
    `?select=commitment_id,side,who,what,due_at,status,confidence,conversation_global_id,evidence_chunk_id,created_at` +
    `&project_id=eq.${encodeURIComponent(project_id)}` +
    `&status=neq.canceled` +
    `&order=created_at.desc` +
    `&limit=${limit}`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders(env) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase list commitments ${res.status}: ${txt}`);

  const data = safeJson(txt);
  return Array.isArray(data) ? data : [];
}

export async function upsertCommitments(env, { project_id, items }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "agent-gw");
  if (!Array.isArray(items) || !items.length) return { attempted: 0, ok: 0, skipped: 0 };

  const now = new Date().toISOString();

  const rows = items
    .map((it) => ({
      project_id,
      source: "chatwoot",
      conversation_global_id: it.conversation_global_id || null,
      evidence_chunk_id: it.evidence_chunk_id || null,
      side: it.side || "unknown",
      who: it.who || null,
      what: it.what,
      due_at: it.due_at || null,
      status: it.status || "pending",
      confidence: typeof it.confidence === "number" ? it.confidence : null,
      meta: it.meta || {},
      updated_at: now,
    }))
    .filter((r) => r.what && String(r.what).trim().length);

  const url = `${env.SUPABASE_URL}/rest/v1/project_commitments?on_conflict=project_id,side,what,due_at`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });

  const txt = await res.text();

  if (!res.ok) {
    // Treat dedup conflicts as no-op (idempotent behavior)
    if (res.status === 409 && txt.includes('"code":"23505"') && txt.includes('project_commitments_dedup_idx')) {
      return { attempted: rows.length, ok: 0, skipped: rows.length };
    }
    throw new Error(`Supabase upsert commitments ${res.status}: ${txt}`);
  }

  const data = safeJson(txt);
  const ok = Array.isArray(data) ? data.length : 0;
  const skipped = Math.max(0, rows.length - ok);
  return { attempted: rows.length, ok, skipped };
}

function toIntInRange(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isVectorSearchEnabled(env) {
  const raw = String(env.RAG_VECTOR_SEARCH_ENABLED || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function isCustomRpcArgConfig(env) {
  return Boolean(env.RAG_RPC_QUERY_ARG || env.RAG_RPC_PROJECT_ARG || env.RAG_RPC_LIMIT_ARG || env.RAG_RPC_THRESHOLD_ARG);
}

function buildConfiguredRpcPayload(env, { project_id, query_embedding, limit }) {
  const queryArg = String(env.RAG_RPC_QUERY_ARG || "query_embedding").trim();
  const projectArg = String(env.RAG_RPC_PROJECT_ARG || "project_id").trim();
  const limitArg = String(env.RAG_RPC_LIMIT_ARG || "match_count").trim();
  const thresholdArg = String(env.RAG_RPC_THRESHOLD_ARG || "").trim();

  const payload = { [queryArg]: query_embedding };
  if (projectArg) payload[projectArg] = project_id;
  if (limitArg) payload[limitArg] = limit;

  if (thresholdArg) {
    const thresholdRaw = String(env.RAG_RPC_THRESHOLD || env.RAG_MATCH_THRESHOLD || "").trim();
    const threshold = Number.parseFloat(thresholdRaw);
    if (Number.isFinite(threshold)) payload[thresholdArg] = threshold;
  }

  return payload;
}

function uniquePayloads(payloads) {
  const out = [];
  const seen = new Set();
  for (const p of payloads) {
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

async function callMatchRagChunksRpc(env, rpcName, payload) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(rpcName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify(payload),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase RPC ${rpcName} ${res.status}: ${txt}`);

  const data = safeJson(txt);
  return Array.isArray(data) ? data : [];
}

function normalizeVectorRows(rows, project_id) {
  return rows
    .map((row) => ({
      chunk_id: row?.chunk_id || row?.id || row?.rag_chunk_id || null,
      project_id: row?.project_id || project_id,
      conversation_global_id: row?.conversation_global_id || row?.conversation_id || null,
      text: String(row?.text ?? row?.content ?? row?.chunk_text ?? "").trim(),
      metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
      created_at: row?.created_at || row?.source_updated_at || null,
      similarity: typeof row?.similarity === "number" ? row.similarity : null,
    }))
    .filter((row) => row.text.length > 0);
}

async function ragSearchIlikeFallback(env, { project_id, query_text, limit }) {
  const q = String(query_text || "").replaceAll("%", "\\%").replaceAll("_", "\\_");
  const like = `%${q}%`;

  const url =
    `${env.SUPABASE_URL}/rest/v1/rag_chunks` +
    `?select=chunk_id,project_id,conversation_global_id,text,metadata,created_at` +
    `&project_id=eq.${encodeURIComponent(project_id)}` +
    `&text=ilike.${encodeURIComponent(like)}` +
    `&limit=${limit}` +
    `&order=created_at.desc`;

  const res = await fetch(url, { method: "GET", headers: supabaseHeaders(env) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase RAG ${res.status}: ${txt}`);

  const data = safeJson(txt);
  return Array.isArray(data) ? data : [];
}

export async function ragSearchMvp(env, { project_id, query_text, limit = 5 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "agent-gw");
  const safeLimit = toIntInRange(limit, 5, 1, 25);
  const query = String(query_text || "").trim();
  if (!query) return [];

  if (!isVectorSearchEnabled(env)) {
    return ragSearchIlikeFallback(env, { project_id, query_text: query, limit: safeLimit });
  }

  try {
    const rpcName = String(env.RAG_MATCH_RPC || "match_rag_chunks").trim();
    const { embedding } = await openaiEmbedding(env, query);

    const configured = buildConfiguredRpcPayload(env, {
      project_id,
      query_embedding: embedding,
      limit: safeLimit,
    });

    const fallbackVariants = isCustomRpcArgConfig(env)
      ? []
      : [
          { query_embedding: embedding, project_id, match_count: safeLimit },
          { query_embedding: embedding, filter_project_id: project_id, match_count: safeLimit },
          { query_embedding: embedding, p_project_id: project_id, match_count: safeLimit },
          { query_embedding: embedding, project_id, limit: safeLimit },
          { embedding, project_id, match_count: safeLimit },
        ];

    const payloads = uniquePayloads([configured, ...fallbackVariants]);
    let lastRpcErr = null;
    let rpcCallSucceeded = false;

    for (const payload of payloads) {
      try {
        const rows = await callMatchRagChunksRpc(env, rpcName, payload);
        rpcCallSucceeded = true;
        const normalized = normalizeVectorRows(rows, project_id).slice(0, safeLimit);
        if (normalized.length) return normalized;
        break;
      } catch (e) {
        lastRpcErr = e;
      }
    }

    if (!rpcCallSucceeded && lastRpcErr) {
      const msg = String(lastRpcErr?.message || lastRpcErr);
      console.warn("[agent-gw] vector RPC unavailable; fallback to ilike", { rpc: rpcName, error: msg });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn("[agent-gw] vector retrieval setup failed; fallback to ilike", { error: msg });
  }

  return ragSearchIlikeFallback(env, { project_id, query_text: query, limit: safeLimit });
}
