// @ts-nocheck

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/__whoami") {
      return new Response("tgbot:FIN-v7 (commitments+search+voice)", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/__env") {
      return new Response(
        JSON.stringify({
          ENV: env.ENV || null,
          TELEGRAM_WEBHOOK_PATH: env.TELEGRAM_WEBHOOK_PATH || null,
          SUPABASE_URL: env.SUPABASE_URL || null,
          HAS_AGENT_GW_BINDING: Boolean(env.AGENT_GW),
          HAS_OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
        }),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "tgbot", version: "FIN-v7" });
    }

    if (url.pathname === env.TELEGRAM_WEBHOOK_PATH) {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      const ct = request.headers.get("content-type") || "";
      if (!ct.toLowerCase().includes("application/json")) return new Response("Unsupported Media Type", { status: 415 });

      const update = await request.json();
      ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  },
};

/* -----------------------------
   Errors
------------------------------ */

function debugId() {
  return crypto.randomUUID().slice(0, 8);
}

function formatError(e) {
  const msg = (e && typeof e.message === "string") ? e.message : String(e);
  const stack = (e && typeof e.stack === "string") ? e.stack : "";
  const stackShort = stack.split("\n").slice(0, 10).join("\n");
  return { msg, stackShort };
}

async function sendErrorToChat(env, chatId, id, where, e) {
  const { msg, stackShort } = formatError(e);
  const text =
    `<b>❌ Ошибка</b> <code>${escapeHtml(where)}</code>\n` +
    `id: <code>${escapeHtml(id)}</code>\n\n` +
    `<b>message</b>\n<code>${escapeHtml(msg)}</code>\n` +
    (stackShort ? `\n<b>stack</b>\n<code>${escapeHtml(stackShort)}</code>\n` : "");

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME"), btn("📁 Projects", "NAV:PROJECTS")]]),
  });
}

/* -----------------------------
   Router
------------------------------ */

async function handleTelegramUpdate(update, env) {
  const id = debugId();
  try {
    if (update.message) return await onMessage(update.message, env, id);
    if (update.callback_query) return await onCallbackQuery(update.callback_query, env, id);
  } catch (e) {
    const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
    if (chatId) return await sendErrorToChat(env, chatId, id, "handleTelegramUpdate", e);
  }
}

async function onMessage(message, env, id) {
  const chatId = message.chat.id;
  const from = message.from;
  const uid = String(from.id);

  await upsertTelegramUser(env, from);

  let text = (message.text || "").trim();

  // Voice/audio -> transcription (optional)
  if (!text && (message.voice || message.audio)) {
    const fileId = message.voice?.file_id || message.audio?.file_id;
    if (!fileId) return;

    await tgSendMessage(env, chatId, "<b>🎙️ Голос</b>\nРаспознаю…", {});
    const transcript = await transcribeTelegramFile(env, fileId);
    text = transcript.trim();

    if (!text) {
      return tgSendMessage(env, chatId, "Не удалось распознать голос.", {
        reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]),
      });
    }

    await tgSendMessage(env, chatId, `<b>📝 Распознано:</b>\n<blockquote>${escapeHtml(text)}</blockquote>`, {
      reply_markup: toReplyMarkup([[btn("🤝 Договоренности", "NAV:COMMIT"), btn("🔎 Search", "NAV:SEARCH")]]),
    });
  }

  // Commands
  if (text === "/start" || text === "/home") return renderHome(env, chatId, uid);
  if (text === "/projects") return renderProjectsList(env, chatId, uid);
  if (text === "/help") return tgSendMessage(env, chatId, helpText(), { reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]) });

  // Wizard
  const pending = await getUserPendingInput(env, uid);

  if (pending?.kind === "new_project_name") {
    if (text.length < 2 || text.length > 80) return tgSendMessage(env, chatId, "Введите имя проекта (2–80 символов):", {});
    const pid = await createProject(env, text);
    await setActiveProject(env, uid, pid);
    await clearUserPendingInput(env, uid);
    return renderDashboard(env, chatId, uid, pid);
  }

  if (pending?.kind === "search_query") {
    await clearUserPendingInput(env, uid);
    return runViaGateway(env, chatId, uid, text, id);
  }

  // Text intent shortcuts
  if (isCommitmentsText(text)) return runViaGateway(env, chatId, uid, "договоренности", id);

  // Default: forward to gateway
  return runViaGateway(env, chatId, uid, text, id);
}

async function onCallbackQuery(cq, env, id) {
  const data = cq.data || "";
  const chatId = cq.message?.chat?.id;
  const uid = String(cq.from?.id || "");

  await tgAnswerCallbackQuery(env, cq.id).catch(() => {});
  if (!chatId || !uid) return;

  try {
    await upsertTelegramUser(env, cq.from);

    if (data === "NAV:HOME") return renderHome(env, chatId, uid);
    if (data === "NAV:PROJECTS") return renderProjectsList(env, chatId, uid);

    if (data === "NAV:DASH") {
      const pid = await getActiveProjectId(env, uid);
      return pid ? renderDashboard(env, chatId, uid, pid) : renderProjectsList(env, chatId, uid);
    }

    if (data === "NAV:COMMIT") {
      const pid = await getActiveProjectId(env, uid);
      if (!pid) return renderProjectsList(env, chatId, uid);
      return runViaGateway(env, chatId, uid, "договоренности", id);
    }

    if (data === "NAV:SEARCH") {
      const pid = await getActiveProjectId(env, uid);
      if (!pid) return renderProjectsList(env, chatId, uid);

      await setUserPendingInput(env, uid, "search_query", { id }, 600);
      return tgSendMessage(env, chatId, "<b>🔎 Search</b>\nВведите запрос текстом или голосом.", {
        reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]),
      });
    }

    if (data === "PRJ:NEW") {
      await setUserPendingInput(env, uid, "new_project_name", { id }, 600);
      return tgSendMessage(env, chatId, "<b>Новый проект</b>\nВведите имя:", {
        reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]),
      });
    }

    if (data.startsWith("PRJ:SET:")) {
      const pid = data.slice("PRJ:SET:".length);
      await setActiveProject(env, uid, pid);
      return renderDashboard(env, chatId, uid, pid);
    }

    return tgSendMessage(env, chatId, "Неизвестное действие.", { reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]) });
  } catch (e) {
    return sendErrorToChat(env, chatId, id, `callback:${data}`, e);
  }
}

/* -----------------------------
   Screens
------------------------------ */

async function renderHome(env, chatId, uid) {
  const pid = await getActiveProjectId(env, uid);

  let text = "<b>🏠 Home</b>\n";
  if (pid) {
    const p = await getProject(env, pid);
    text += `\n<b>Active:</b> ${escapeHtml(p?.name || "—")}\n<code>${escapeHtml(pid)}</code>\n`;
  } else {
    text += "\n<b>Active:</b> —\n";
  }

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([
      [btn("📁 Projects", "NAV:PROJECTS"), btn("📊 Dashboard", "NAV:DASH")],
      [btn("🤝 Договоренности", "NAV:COMMIT"), btn("🔎 Search", "NAV:SEARCH")],
      [btn("🏠 Home", "NAV:HOME")],
    ]),
  });
}

async function renderProjectsList(env, chatId, uid) {
  const projects = await listProjects(env);
  const active = await getActiveProjectId(env, uid);

  const lines = ["<b>📁 Projects</b>"];
  const kb = [];

  if (!projects.length) {
    lines.push("\nПока нет проектов.");
  } else {
    for (const p of projects) {
      const mark = active === p.project_id ? " <b>(active)</b>" : "";
      lines.push(`\n• ${escapeHtml(p.name)}${mark}\n<code>${escapeHtml(shortId(p.project_id))}</code>`);
      kb.push([btn(`Открыть: ${p.name}`, `PRJ:SET:${p.project_id}`)]);
    }
  }

  kb.push([btn("➕ New project", "PRJ:NEW")]);
  kb.push([btn("🏠 Home", "NAV:HOME")]);

  return tgSendMessage(env, chatId, lines.join("\n"), { reply_markup: toReplyMarkup(kb) });
}

async function renderDashboard(env, chatId, uid, pid) {
  const p = await getProject(env, pid);
  const c = await getLinkCounts(env, pid);

  const text =
    `<b>📊 Dashboard</b>\n\n` +
    `<b>Project:</b> ${escapeHtml(p?.name || "—")}\n` +
    `<b>Status:</b> <code>${escapeHtml(p?.status || "—")}</code>\n` +
    `<b>ID:</b>\n<code>${escapeHtml(pid)}</code>\n\n` +
    `<b>Linked</b>\n` +
    `• conv: <code>${c.conversation}</code>\n` +
    `• people: <code>${c.person}</code>\n` +
    `• deals: <code>${c.deal}</code>\n` +
    `• company: <code>${c.company ? "yes" : "no"}</code>\n` +
    `• linear: <code>${c.linear_project ? "yes" : "no"}</code>\n`;

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([
      [btn("🤝 Договоренности", "NAV:COMMIT"), btn("🔎 Search", "NAV:SEARCH")],
      [btn("📁 Projects", "NAV:PROJECTS"), btn("🏠 Home", "NAV:HOME")],
    ]),
  });
}

/* -----------------------------
   Gateway call (Service Binding)
------------------------------ */

async function runViaGateway(env, chatId, uid, query, id) {
  const pid = await getActiveProjectId(env, uid);
  if (!pid) {
    return tgSendMessage(env, chatId, "Сначала выберите проект.", {
      reply_markup: toReplyMarkup([[btn("📁 Projects", "NAV:PROJECTS")]]),
    });
  }

  if (!env.AGENT_GW) throw new Error("Missing service binding AGENT_GW");

  const ctx = await loadProjectContext(env, pid);

  const body = JSON.stringify({
    request_id: id,
    telegram_user_id: uid,
    chat_id: String(chatId),
    active_project_id: pid,
    user_text: query,
    context: ctx,
  });

  const sig = await hmacSha256Hex(env.AGENT_GATEWAY_HMAC_SECRET || "", body);

  const res = await env.AGENT_GW.fetch("https://service/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${txt || "(empty body)"}`);

  const data = safeJson(txt);
  if (!data?.text || !Array.isArray(data?.keyboard)) throw new Error(`Gateway bad response: ${txt}`);

  return tgSendMessage(env, chatId, data.text, { reply_markup: JSON.stringify({ inline_keyboard: data.keyboard }) });
}

function isCommitmentsText(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("договор") || t.includes("обещ") || t.includes("кто что должен") || t.includes("commit");
}

/* -----------------------------
   Voice (optional)
------------------------------ */

async function transcribeTelegramFile(env, fileId) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing (needed for voice transcription)");

  const file = await tgCall(env, "getFile", { file_id: fileId });
  const filePath = file?.file_path;
  if (!filePath) throw new Error("Telegram getFile: no file_path");

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const audioRes = await fetch(fileUrl);
  if (!audioRes.ok) throw new Error(`Telegram file download ${audioRes.status}`);

  const audioBytes = await audioRes.arrayBuffer();

  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", new Blob([audioBytes]), "audio.ogg");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`OpenAI transcribe ${res.status}: ${txt}`);

  const data = safeJson(txt);
  return String(data?.text || "");
}

/* -----------------------------
   Supabase
------------------------------ */

function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates",
  };
}

async function sbFetch(env, path, { method = "GET", body } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: sbHeaders(env),
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  const data = txt ? safeJson(txt) : null;
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${txt || "(empty body)"}`);
  return { data };
}

async function upsertTelegramUser(env, from) {
  const row = {
    telegram_user_id: String(from.id),
    username: from.username || null,
    first_name: from.first_name || null,
    last_name: from.last_name || null,
  };
  await sbFetch(env, `/telegram_users?on_conflict=telegram_user_id`, { method: "POST", body: row });
}

async function listProjects(env) {
  const { data } = await sbFetch(env, `/projects?select=project_id,name,status&order=created_at.desc`);
  return Array.isArray(data) ? data : [];
}

async function getProject(env, pid) {
  const { data } = await sbFetch(env, `/projects?select=project_id,name,status&project_id=eq.${encodeURIComponent(pid)}&limit=1`);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function getActiveProjectId(env, uid) {
  const { data } = await sbFetch(env, `/user_project_state?select=project_id&telegram_user_id=eq.${encodeURIComponent(String(uid))}&is_active=eq.true&limit=1`);
  return Array.isArray(data) && data[0] ? data[0].project_id : null;
}

async function setActiveProject(env, uid, pid) {
  const userId = String(uid);
  const now = new Date().toISOString();

  await sbFetch(env, `/user_project_state?telegram_user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: { is_active: false, updated_at: now },
  });

  await sbFetch(
    env,
    `/user_project_state?telegram_user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(pid)}`,
    { method: "PATCH", body: { is_active: true, last_used_at: now, updated_at: now } }
  );

  const { data } = await sbFetch(
    env,
    `/user_project_state?select=id&telegram_user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(pid)}&limit=1`
  );

  if (!(Array.isArray(data) && data[0])) {
    await sbFetch(env, `/user_project_state`, {
      method: "POST",
      body: { telegram_user_id: userId, project_id: pid, is_active: true, last_used_at: now, updated_at: now },
    });
  }
}

async function getUserPendingInput(env, uid) {
  const userId = String(uid);
  const { data } = await sbFetch(env, `/user_input_state?select=kind,payload,expires_at&telegram_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function setUserPendingInput(env, uid, kind, payload = {}, ttlSeconds = 600) {
  const row = {
    telegram_user_id: String(uid),
    kind,
    payload,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await sbFetch(env, `/user_input_state?on_conflict=telegram_user_id`, { method: "POST", body: row });
}

async function clearUserPendingInput(env, uid) {
  await sbFetch(env, `/user_input_state?telegram_user_id=eq.${encodeURIComponent(String(uid))}`, { method: "DELETE" });
}

async function createProject(env, name) {
  const pid = crypto.randomUUID();
  await sbFetch(env, `/projects?on_conflict=project_id`, {
    method: "POST",
    body: { project_id: pid, name, status: "open", meta: {}, updated_at: new Date().toISOString() },
  });
  return pid;
}

async function loadProjectContext(env, pid) {
  const [links, proj] = await Promise.all([
    sbFetch(env, `/project_links?select=source_system,external_type,external_id,meta&project_id=eq.${encodeURIComponent(pid)}&limit=200`).then(r => r.data || []),
    getProject(env, pid),
  ]);
  return { project: proj, links };
}

async function getLinkCounts(env, pid) {
  const { data } = await sbFetch(env, `/project_links?select=external_type&project_id=eq.${encodeURIComponent(pid)}&limit=500`);
  const arr = Array.isArray(data) ? data : [];
  const count = (t) => arr.filter((x) => x.external_type === t).length;
  return {
    conversation: count("conversation"),
    person: count("person"),
    deal: count("deal"),
    company: count("company") > 0,
    linear_project: count("linear_project") > 0,
  };
}

/* -----------------------------
   Telegram + crypto + misc
------------------------------ */

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

async function tgCall(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

function tgSendMessage(env, chat_id, text, opts = {}) {
  return tgCall(env, "sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...opts,
  });
}

function tgAnswerCallbackQuery(env, callback_query_id) {
  return tgCall(env, "answerCallbackQuery", { callback_query_id });
}

function btn(text, callback_data) {
  return { text, callback_data };
}

function toReplyMarkup(rows) {
  return JSON.stringify({ inline_keyboard: rows });
}

function shortId(id) {
  const s = String(id || "");
  return s.length <= 10 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function helpText() {
  return (
    "<b>Помощь</b>\n\n" +
    "• /start — Home\n" +
    "• /projects — проекты\n\n" +
    "• 🤝 Договоренности — кто-что-должен по проекту\n" +
    "• 🔎 Search — поиск\n\n" +
    "Голос: отправьте voice/audio (нужен OPENAI_API_KEY)."
  );
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
