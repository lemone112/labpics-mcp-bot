// @ts-nocheck

import { btn, toReplyMarkup, escapeHtml, shortId, json, safeJson } from "./lib/ui.js";
import { tgSendMessage, tgAnswerCallbackQuery } from "./lib/telegram.js";
import {
  upsertTelegramUser,
  listProjects,
  getProject,
  getActiveProjectId,
  setActiveProject,
  getUserPendingInput,
  setUserPendingInput,
  clearUserPendingInput,
  createProject,
  loadProjectContext,
  getLinkCounts,
} from "./lib/supabase.js";
import { hmacSha256Hex } from "./lib/security.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const webhookPath = normalizeWebhookPath(env.TELEGRAM_WEBHOOK_PATH);

    if (url.pathname === "/__whoami") {
      return new Response("tgbot:refactor-lib-split", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/__env") {
      return json({
        ENV: env.ENV || null,
        TELEGRAM_WEBHOOK_PATH: webhookPath,
        SUPABASE_URL: env.SUPABASE_URL || null,
        HAS_AGENT_GW_BINDING: Boolean(env.AGENT_GW),
        HAS_OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
      });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "tgbot", version: "refactor-1" });
    }

    if (webhookPath && url.pathname === webhookPath) {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      const ct = request.headers.get("content-type") || "";
      if (!ct.toLowerCase().includes("application/json")) return new Response("Unsupported Media Type", { status: 415 });

      const expectedSecret = String(env.TELEGRAM_WEBHOOK_SECRET_TOKEN || "").trim();
      if (expectedSecret) {
        const gotSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
        if (gotSecret !== expectedSecret) return new Response("Unauthorized", { status: 401 });
      }

      let update = null;
      try {
        update = await request.json();
      } catch {
        return new Response("Bad Request: invalid JSON", { status: 400 });
      }
      ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  },
};

function debugId() {
  return crypto.randomUUID().slice(0, 8);
}

function formatError(e) {
  const msg = (e && typeof e.message === "string") ? e.message : String(e);
  const stack = (e && typeof e.stack === "string") ? e.stack : "";
  const stackShort = stack.split("\n").slice(0, 10).join("\n");
  return { msg, stackShort };
}

function isDevEnv(env) {
  const mode = String(env?.ENV || "").toLowerCase();
  return mode === "dev" || mode === "development" || mode === "local";
}

function safeText(s, maxLen = 1200) {
  const txt = String(s || "");
  return txt.length > maxLen ? `${txt.slice(0, maxLen - 1)}…` : txt;
}

function normalizeWebhookPath(pathValue) {
  const raw = String(pathValue || "").trim();
  if (!raw) return null;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function isPendingExpired(pending) {
  if (!pending?.expires_at) return false;
  const exp = Date.parse(String(pending.expires_at));
  return Number.isFinite(exp) && exp <= Date.now();
}

function isValidGatewayKeyboard(kb) {
  if (!Array.isArray(kb)) return false;
  return kb.every(
    (row) =>
      Array.isArray(row) &&
      row.every((x) => x && typeof x.text === "string" && typeof x.callback_data === "string")
  );
}

async function sendErrorToChat(env, chatId, id, where, e) {
  const { msg, stackShort } = formatError(e);
  const debug = isDevEnv(env);

  let text =
    `<b>❌ Ошибка</b>\n` +
    `Не удалось обработать запрос.\n` +
    `id: <code>${escapeHtml(id)}</code>\n`;

  if (debug) {
    text +=
      `\n<b>where</b>\n<code>${escapeHtml(safeText(where, 200))}</code>\n` +
      `<b>message</b>\n<code>${escapeHtml(safeText(msg, 600))}</code>\n` +
      (stackShort ? `\n<b>stack</b>\n<code>${escapeHtml(safeText(stackShort, 1200))}</code>\n` : "");
  }

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME"), btn("📁 Projects", "NAV:PROJECTS")]]),
  });
}

async function handleTelegramUpdate(update, env) {
  const id = debugId();
  try {
    if (update.message) return await onMessage(update.message, env, id);
    if (update.callback_query) return await onCallbackQuery(update.callback_query, env, id);
  } catch (e) {
    console.error("[tgbot] handleTelegramUpdate failed", { id, error: formatError(e) });
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

  if (text === "/start" || text === "/home") return renderHome(env, chatId, uid);
  if (text === "/projects") return renderProjectsList(env, chatId, uid);
  if (text === "/help") return tgSendMessage(env, chatId, helpText(), { reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]) });

  let pending = await getUserPendingInput(env, uid);
  if (pending && isPendingExpired(pending)) {
    await clearUserPendingInput(env, uid);
    pending = null;
  }

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

  if (isCommitmentsText(text)) return runViaGateway(env, chatId, uid, "договоренности", id);
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
      return tgSendMessage(env, chatId, "<b>🔎 Search</b>\nВведите запрос текстом.", {
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
      const project = await getProject(env, pid);
      if (!project) {
        return tgSendMessage(env, chatId, "Проект не найден.", {
          reply_markup: toReplyMarkup([[btn("📁 Projects", "NAV:PROJECTS"), btn("🏠 Home", "NAV:HOME")]]),
        });
      }
      await setActiveProject(env, uid, pid);
      return renderDashboard(env, chatId, uid, pid);
    }

    return tgSendMessage(env, chatId, "Неизвестное действие.", { reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]) });
  } catch (e) {
    return sendErrorToChat(env, chatId, id, `callback:${data}`, e);
  }
}

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
      kb.push([btn(`Открыть: ${safeText(p.name, 40)}`, `PRJ:SET:${p.project_id}`)]);
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

async function runViaGateway(env, chatId, uid, query, id) {
  const pid = await getActiveProjectId(env, uid);
  if (!pid) {
    return tgSendMessage(env, chatId, "Сначала выберите проект.", {
      reply_markup: toReplyMarkup([[btn("📁 Projects", "NAV:PROJECTS")]]),
    });
  }

  if (!env.AGENT_GW) throw new Error("Missing service binding AGENT_GW");
  const hmacSecret = String(env.AGENT_GATEWAY_HMAC_SECRET || "").trim();
  if (!hmacSecret) throw new Error("Missing AGENT_GATEWAY_HMAC_SECRET");

  const userText = String(query || "").trim().slice(0, 2000);
  if (!userText) {
    return tgSendMessage(env, chatId, "Введите запрос текстом.", {
      reply_markup: toReplyMarkup([[btn("🏠 Home", "NAV:HOME")]]),
    });
  }

  const context = await loadProjectContext(env, pid);
  const body = JSON.stringify({
    request_id: id,
    telegram_user_id: uid,
    chat_id: String(chatId),
    active_project_id: pid,
    user_text: userText,
    context,
  });

  const sig = await hmacSha256Hex(hmacSecret, body);

  const res = await env.AGENT_GW.fetch("https://service/agent/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body,
  });

  const txt = await res.text();
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${txt || "(empty body)"}`);

  const data = safeJson(txt);
  if (typeof data?.text !== "string" || !data.text.trim() || !isValidGatewayKeyboard(data?.keyboard)) {
    throw new Error(`Gateway bad response: ${txt}`);
  }

  return tgSendMessage(env, chatId, data.text, { reply_markup: JSON.stringify({ inline_keyboard: data.keyboard }) });
}

function isCommitmentsText(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("договор") || t.includes("обещ") || t.includes("кто что должен") || t.includes("commit");
}

function helpText() {
  return (
    "<b>Помощь</b>\n\n" +
    "• /start — Home\n" +
    "• /projects — проекты\n\n" +
    "• 🤝 Договоренности — кто-что-должен по проекту\n" +
    "• 🔎 Search — поиск\n"
  );
}
