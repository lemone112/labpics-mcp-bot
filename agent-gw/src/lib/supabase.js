// @ts-nocheck

import { safeJson } from "./util.js";
import { requireEnv } from "./security.js";

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

export async function ragSearchMvp(env, { project_id, query_text, limit = 5 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], "agent-gw");
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
