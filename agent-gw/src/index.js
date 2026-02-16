// @ts-nocheck

import { json } from "./lib/util.js";
import { hmacSha256Hex } from "./lib/security.js";
import { fetchRecentChunks, upsertCommitments, listCommitments, ragSearchMvp } from "./lib/supabase.js";
import { openaiChatJsonObject, parseItemsRobust } from "./lib/openai.js";
import { renderCommitmentsCard, renderSearchResults } from "./lib/render.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__whoami") {
      return new Response("agent-gw:refactor-lib-split", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "agent-gw", version: "refactor-1" });
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

      const payload = JSON.parse(bodyText);
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

      const matches = await ragSearchMvp(env, { project_id: projectId, query_text: userText || " ", limit: 5 });
      return json({
        ok: true,
        text: renderSearchResults(projectName, userText, matches),
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

async function extractCommitmentsLLM(env, { projectName, projectId, chunks }) {
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
  const items = parseItemsRobust(respText);
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
