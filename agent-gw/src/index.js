// @ts-nocheck

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__whoami") {
      return new Response("agent-gw:FIN-v8 (commitments json-mode + robust parse)", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "agent-gw", version: "FIN-v8" });
    }

    if (url.pathname === "/__env") {
      return json({
        ok: true,
        has_SUPABASE_URL: Boolean(env.SUPABASE_URL),
        has_SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        has_OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
        has_HMAC_SECRET: Boolean(env.AGENT_GATEWAY_HMAC_SECRET),
      });
    }

    if (url.pathname === "/agent/run" || url.pathname === "/agent/run/") {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

      const bodyText = await request.text();
      const sig = request.headers.get("x-signature") || "";

      const hmacSecret = env.AGENT_GATEWAY_HMAC_SECRET || "";
      if (!hmacSecret) return new Response("missing hmac secret", { status: 500 });

      const expected = await hmacSha256Hex(hmacSecret, bodyText);
      if (!sig || sig !== expected) return new Response("bad signature", { status: 401 });

      const payload = safeJson(bodyText) || {};
      const projectName = payload?.context?.project?.name || "—";
      const projectId = String(payload?.active_project_id || "").trim();
      const userText = String(payload?.user_text || "").trim();

      if (!projectId) {
        return json({
          ok: true,
          text: "Нет active_project_id — выберите проект.",
          keyboard: [[{ text: "📁 Projects", callback_data: "NAV:PROJECTS" }], [{ text: "🏠 Home", callback_data: "NAV:HOME" }]],
        });
      }

      const intent = detectIntent(userText);

      if (intent === "commitments") {
        const chunks = await fetchRecentChunks(env, { project_id: projectId, limit: 80 });

        if (!chunks.length) {
          return json({
            ok: true,
            text: `🤝 Договоренности\n\nПроект: ${projectName}\n\nНет данных (rag_chunks пуст для этого project_id).`,
            keyboard: [[{ text: "📊 Dashboard", callback_data: "NAV:DASH" }, { text: "🏠 Home", callback_data: "NAV:HOME" }]],
          });
        }

        const extracted = await extractCommitmentsLLM(env, { projectName, projectId, chunks });
        const upserted = await upsertCommitments(env, { project_id: projectId, items: extracted.items });
        const top = await listCommitments(env, { project_id: projectId, limit: 10 });

        return json({
          ok: true,
          text: renderCommitmentsCard(projectName, projectId, top, upserted),
          keyboard: [
            [{ text: "🔄 Обновить", callback_data: "NAV:COMMIT" }, { text: "📊 Dashboard", callback_data: "NAV:DASH" }],
            [{ text: "🏠 Home", callback_data: "NAV:HOME" }],
          ],
        });
      }

      // Fallback search
      const matches = await ragSearchMvp(env, { project_id: projectId, query_text: userText || " ", limit: 5 });
      const header = `🔎 Search\n\nПроект: ${projectName}\nЗапрос: ${userText || "—"}\n\n`;
      const lines = matches.map((m, i) => `${i + 1}) ${snippetText(m.text, 220)} (conv ${shortId(m.conversation_global_id)})`);
      return json({
        ok: true,
        text: matches.length ? header + lines.join("\n\n") : header + "Ничего не найдено.",
        keyboard: [[{ text: "🤝 Договоренности", callback_data: "NAV:COMMIT" }, { text: "🏠 Home", callback_data: "NAV:HOME" }]],
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

function detectIntent(userText) {
  const t = String(userText || "").toLowerCase();
  if (
    t.includes("договор") ||
    t.includes("договоренности") ||
    t.includes("обещ") ||
    t.includes("кто что должен") ||
    t.includes("коммит") ||
    t.includes("commitment")
  ) return "commitments";
  return "search";
}

function requireEnv(env, keys) {
  for (const k of keys) if (!env[k]) throw new Error(`${k} missing in agent-gw`);
}

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

async function fetchRecentChunks(env, { project_id, limit = 80 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

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

async function upsertCommitments(env, { project_id, items }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!Array.isArray(items) || !items.length) return { attempted: 0, ok: 0 };

  const now = new Date().toISOString();

  const rows = items.map((it) => ({
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
  })).filter(r => r.what && String(r.what).trim().length);

  const url = `${env.SUPABASE_URL}/rest/v1/project_commitments?on_conflict=project_id,side,what,due_at`;

  const res = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Supabase upsert commitments ${res.status}: ${txt}`);

  const data = safeJson(txt);
  const ok = Array.isArray(data) ? data.length : 0;
  return { attempted: rows.length, ok };
}

async function listCommitments(env, { project_id, limit = 10 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

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

async function extractCommitmentsLLM(env, { projectName, projectId, chunks }) {
  requireEnv(env, ["OPENAI_API_KEY"]);

  const source = chunks.slice(0, 60).map((c) => ({
    chunk_id: c.chunk_id,
    conversation_global_id: c.conversation_global_id,
    created_at: c.created_at,
    text: c.text,
  }));

  const system = [
    "Extract commitments/agreements (who owes what, by when) from conversation chunks.",
    "Return ONLY a JSON object with a single key: items (array). No other keys.",
    "side must be one of: client, us, unknown.",
    "due_at must be ISO8601 or null.",
    "status must be: pending, done, canceled.",
    "Be conservative: only clear obligations/next steps.",
    "Always include evidence_chunk_id and conversation_global_id when possible.",
  ].join(" ");

  const user = {
    project: { projectId, projectName },
    items_schema: {
      side: "client|us|unknown",
      who: "string|null",
      what: "string",
      due_at: "ISO8601|null",
      status: "pending|done|canceled",
      confidence: "number(0..1)",
      conversation_global_id: "string|null",
      evidence_chunk_id: "string|null",
      meta: "object",
    },
    chunks: source,
  };

  const respText = await openaiChatJsonObject(env, system, user);

  let parsed = safeJson(respText);
  let items =
    (parsed && Array.isArray(parsed.items) && parsed.items) ||
    (parsed && parsed.schema && Array.isArray(parsed.schema.items) && parsed.schema.items) ||
    null;

  if (!items) {
    const m = respText.match(/\{[\s\S]*\}/);
    if (m) {
      const obj = safeJson(m[0]);
      items =
        (obj && Array.isArray(obj.items) && obj.items) ||
        (obj && obj.schema && Array.isArray(obj.schema.items) && obj.schema.items) ||
        null;
    }
  }

  if (!items) throw new Error(`LLM returned invalid JSON: ${respText.slice(0, 800)}`);

  const normalized = items
    .map((x) => ({
      side: ["client", "us", "unknown"].includes(x.side) ? x.side : "unknown",
      who: x.who ?? null,
      what: String(x.what || "").trim(),
      due_at: x.due_at || null,
      status: ["pending", "done", "canceled"].includes(x.status) ? x.status : "pending",
      confidence: typeof x.confidence === "number" ? Math.max(0, Math.min(1, x.confidence)) : 0.6,
      conversation_global_id: x.conversation_global_id || null,
      evidence_chunk_id: x.evidence_chunk_id || null,
      meta: x.meta && typeof x.meta === "object" ? x.meta : {},
    }))
    .filter((x) => x.what.length >= 6)
    .slice(0, 40);

  return { items: normalized };
}

async function openaiChatJsonObject(env, systemPrompt, userObj) {
  const body = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userObj) },
      { role: "user", content: "Верни ТОЛЬКО JSON-объект формата {\"items\": [...]}" },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${txt}`);

  const data = safeJson(txt);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI unexpected response: ${txt.slice(0, 500)}`);
  return content;
}

function renderCommitmentsCard(projectName, projectId, items, upserted) {
  const bySide = { client: 0, us: 0, unknown: 0 };
  for (const it of items) bySide[it.side] = (bySide[it.side] || 0) + 1;

  const header =
    `🤝 Договоренности\n\n` +
    `Проект: ${projectName}\n` +
    `ID: ${shortId(projectId)}\n\n` +
    `Сводка: client ${bySide.client} • us ${bySide.us} • unknown ${bySide.unknown}\n` +
    `Обновлено: +${upserted.ok}/${upserted.attempted}\n\n`;

  const lines = items.slice(0, 10).map((it, i) => {
    const side = it.side === "client" ? "[Клиент]" : it.side === "us" ? "[Мы]" : "[?]";
    const due = it.due_at ? ` • due ${it.due_at}` : "";
    const who = it.who ? ` (${it.who})` : "";
    return `${i + 1}) ${side}${who} ${it.what}${due}`;
  });

  return header + (lines.length ? lines.join("\n") : "Пока нет явных договоренностей.");
}

async function ragSearchMvp(env, { project_id, query_text, limit = 5 }) {
  requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
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

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function snippetText(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function shortId(id) {
  const s = String(id || "");
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}
