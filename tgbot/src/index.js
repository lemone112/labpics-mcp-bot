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

const UI_DIVIDER = "<code>━━━━━━━━━━━━━━━━━━━━</code>";
const UI_VERSION_BADGE = "<code>crypto-ui v2</code>";

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
  return txt.length > maxLen ? `${txt.slice(0, maxLen - 1)}...` : txt;
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
    `<b>🚫 Terminal error</b>\n` +
    `${UI_DIVIDER}\n` +
    `Не удалось обработать запрос.\n` +
    `trace: <code>${escapeHtml(id)}</code>\n`;

  if (debug) {
    text +=
      `\n<b>where</b>\n<code>${escapeHtml(safeText(where, 200))}</code>\n` +
      `<b>message</b>\n<code>${escapeHtml(safeText(msg, 600))}</code>\n` +
      (stackShort ? `\n<b>stack</b>\n<code>${escapeHtml(safeText(stackShort, 1200))}</code>\n` : "");
  }

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]),
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

  const text = (message.text || "").trim();

  if (text === "/start" || text === "/home") return renderHome(env, chatId, uid);
  if (text === "/projects") return renderProjectsList(env, chatId, uid);
  if (text === "/help") {
    return tgSendMessage(env, chatId, helpText(), {
      reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]),
    });
  }

  let pending = await getUserPendingInput(env, uid);
  if (pending && isPendingExpired(pending)) {
    await clearUserPendingInput(env, uid);
    pending = null;
  }

  if (pending?.kind === "new_project_name") {
    if (text.length < 2 || text.length > 80) {
      return tgSendMessage(
        env,
        chatId,
        `<b>➕ New project</b>\n` +
          `${UI_DIVIDER}\n` +
          `Введите имя проекта (2-80 символов).`,
        {
          reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]),
        }
      );
    }
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
    if (data === "NAV:HELP") {
      return tgSendMessage(env, chatId, helpText(), {
        reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]),
      });
    }

    if (data === "NAV:DASH" || data === "NAV:REFRESH_DASH") {
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
      return tgSendMessage(
        env,
        chatId,
        `<b>🔎 Scout mode</b>\n` +
          `${UI_DIVIDER}\n` +
          `Введите поисковый запрос по проекту.\n` +
          `<code>Пример: что обещал клиент по срокам?</code>`,
        {
          reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("📈 Pulse", "NAV:DASH")]]),
        }
      );
    }

    if (data === "NAV:NEWPROJECT" || data === "PRJ:NEW") {
      await setUserPendingInput(env, uid, "new_project_name", { id }, 600);
      return tgSendMessage(
        env,
        chatId,
        `<b>➕ New project</b>\n` +
          `${UI_DIVIDER}\n` +
          `Введите имя проекта (2-80 символов).\n` +
          `<code>Пример: Crypto Landing Q2</code>`,
        {
          reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]),
        }
      );
    }

    if (data === "NAV:REFRESH_PROJECTS") {
      return renderProjectsList(env, chatId, uid);
    }

    if (data.startsWith("PRJ:SET:") || data.startsWith("PRJ:PIN:")) {
      const pid = data.split(":").slice(2).join(":");
      const project = await getProject(env, pid);
      if (!project) {
        return tgSendMessage(
          env,
          chatId,
          `<b>⚠️ Проект не найден</b>\n` +
            `${UI_DIVIDER}\n` +
            `Возможно, проект уже удален или ID устарел.`,
          {
            reply_markup: toReplyMarkup([[btn("💼 Portfolio", "NAV:PROJECTS"), btn("💠 Home", "NAV:HOME")]]),
          }
        );
      }
      await setActiveProject(env, uid, pid);
      if (data.startsWith("PRJ:PIN:")) {
        return tgSendMessage(
          env,
          chatId,
          `<b>✅ Active project updated</b>\n` +
            `${UI_DIVIDER}\n` +
            `${projectHeadline(project, pid, true)}`,
          {
            reply_markup: toReplyMarkup([
              [btn("📈 Pulse", "NAV:DASH"), btn("💼 Portfolio", "NAV:PROJECTS")],
              [btn("💠 Home", "NAV:HOME")],
            ]),
          }
        );
      }
      return renderDashboard(env, chatId, uid, pid);
    }

    if (data.startsWith("PRJ:OPEN:")) {
      const pid = data.slice("PRJ:OPEN:".length);
      const project = await getProject(env, pid);
      if (!project) return renderProjectsList(env, chatId, uid);
      return renderDashboard(env, chatId, uid, pid);
    }

    return tgSendMessage(
      env,
      chatId,
      `<b>⚠️ Unknown action</b>\n${UI_DIVIDER}\nКоманда не распознана.`,
      { reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME"), btn("💼 Portfolio", "NAV:PROJECTS")]]) }
    );
  } catch (e) {
    return sendErrorToChat(env, chatId, id, `callback:${data}`, e);
  }
}

async function renderHome(env, chatId, uid) {
  const pid = await getActiveProjectId(env, uid);
  const project = pid ? await getProject(env, pid) : null;

  const text =
    `<b>💠 LABPICS CRYPTO CONSOLE</b>\n` +
    `<code>ops terminal • realtime</code>\n` +
    `${UI_DIVIDER}\n` +
    `<b>👤 User:</b> <code>${escapeHtml(shortId(uid, 4, 3))}</code>\n` +
    `<b>🧩 Active:</b> ${project ? projectHeadline(project, pid, true) : "<i>not selected</i>"}\n` +
    `<b>🛠 Mode:</b> <code>project intelligence</code>\n` +
    `${UI_DIVIDER}\n` +
    `<i>Выберите модуль:</i>`;

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([
      [btn("💼 Portfolio", "NAV:PROJECTS"), btn("📈 Pulse", "NAV:DASH")],
      [btn("🤝 Commits", "NAV:COMMIT"), btn("🔎 Scout", "NAV:SEARCH")],
      [btn("❓ Help", "NAV:HELP")],
    ]),
  });
}

async function renderProjectsList(env, chatId, uid) {
  const projects = await listProjects(env);
  const active = await getActiveProjectId(env, uid);

  const lines = [
    "<b>💼 PORTFOLIO</b>",
    "<code>select project • set active context</code>",
    UI_DIVIDER,
  ];
  const kb = [];

  if (!projects.length) {
    lines.push("<i>Пока нет проектов.</i>");
    lines.push("Создайте первый проект и начните сбор памяти.");
  } else {
    const shown = projects.slice(0, 12);
    for (let i = 0; i < shown.length; i++) {
      const p = shown[i];
      const isActive = active === p.project_id;
      const dot = isActive ? "🟢" : "⚪";
      lines.push(
        `${dot} <b>${i + 1}.</b> ${escapeHtml(safeText(p.name, 44))}\n` +
          `   ${statusBadge(p.status)} • <code>${escapeHtml(shortId(p.project_id, 6, 4))}</code>`
      );
      kb.push([
        btn(`${isActive ? "🟢" : "⚪"} ${safeText(p.name, 20)}`, `PRJ:PIN:${p.project_id}`),
        btn("📈", `PRJ:OPEN:${p.project_id}`),
      ]);
    }
    if (projects.length > shown.length) {
      lines.push(`\n<i>Показано ${shown.length} из ${projects.length}. Нажмите Refresh.</i>`);
    }
  }

  kb.push([btn("🔄 Refresh", "NAV:REFRESH_PROJECTS"), btn("➕ New", "NAV:NEWPROJECT")]);
  kb.push([btn("💠 Home", "NAV:HOME"), btn("❓ Help", "NAV:HELP")]);

  return tgSendMessage(env, chatId, lines.join("\n"), { reply_markup: toReplyMarkup(kb) });
}

async function renderDashboard(env, chatId, uid, pid) {
  const p = await getProject(env, pid);
  const c = await getLinkCounts(env, pid);

  const text =
    `<b>📈 PULSE BOARD</b>\n` +
    `<code>project telemetry</code>\n` +
    `${UI_DIVIDER}\n` +
    `${projectHeadline(p, pid, true)}\n` +
    `<b>Status:</b> ${statusBadge(p?.status)}\n` +
    `<b>ID:</b> <code>${escapeHtml(shortId(pid, 8, 6))}</code>\n` +
    `${UI_DIVIDER}\n` +
    `💬 Chats: <code>${c.conversation}</code>\n` +
    `👥 People: <code>${c.person}</code>\n` +
    `💼 Deals: <code>${c.deal}</code>\n` +
    `🏢 Company: ${linkBadge(c.company)}\n` +
    `🧱 Linear: ${linkBadge(c.linear_project)}\n` +
    `${UI_DIVIDER}\n` +
    `<i>Глубокий анализ: Commits / Scout</i>`;

  return tgSendMessage(env, chatId, text, {
    reply_markup: toReplyMarkup([
      [btn("🤝 Commits", "NAV:COMMIT"), btn("🔎 Scout", "NAV:SEARCH")],
      [btn("🔄 Refresh", "NAV:REFRESH_DASH"), btn("💼 Portfolio", "NAV:PROJECTS")],
      [btn("💠 Home", "NAV:HOME")],
    ]),
  });
}

async function runViaGateway(env, chatId, uid, query, id) {
  const pid = await getActiveProjectId(env, uid);
  if (!pid) {
    return tgSendMessage(
      env,
      chatId,
      `<b>⚠️ No active project</b>\n` +
        `${UI_DIVIDER}\n` +
        `Сначала выберите проект в портфеле.`,
      { reply_markup: toReplyMarkup([[btn("💼 Portfolio", "NAV:PROJECTS")]]) }
    );
  }

  if (!env.AGENT_GW) throw new Error("Missing service binding AGENT_GW");
  const hmacSecret = String(env.AGENT_GATEWAY_HMAC_SECRET || "").trim();
  if (!hmacSecret) throw new Error("Missing AGENT_GATEWAY_HMAC_SECRET");

  const userText = String(query || "").trim().slice(0, 2000);
  if (!userText) {
    return tgSendMessage(
      env,
      chatId,
      `<b>📝 Empty query</b>\n` +
        `${UI_DIVIDER}\n` +
        `Введите текстовый запрос для анализа.`,
      { reply_markup: toReplyMarkup([[btn("💠 Home", "NAV:HOME")]]) }
    );
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

  const text = data.text.includes("crypto-ui v2")
    ? data.text
    : `${data.text}\n\n${UI_DIVIDER}\n${UI_VERSION_BADGE}`;

  return tgSendMessage(env, chatId, text, { reply_markup: JSON.stringify({ inline_keyboard: data.keyboard }) });
}

function isCommitmentsText(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("договор") || t.includes("обещ") || t.includes("кто что должен") || t.includes("commit");
}

function helpText() {
  return (
    "<b>❓ HELP / QUICK COMMANDS</b>\n" +
    "<code>cryptobot style navigation</code>\n" +
    `${UI_DIVIDER}\n` +
    "• <code>/start</code> или <code>/home</code> — открыть консоль\n" +
    "• <code>/projects</code> — портфель проектов\n" +
    "• <code>/help</code> — подсказка по командам\n\n" +
    "<b>Основные модули</b>\n" +
    "• 🤝 <b>Commits</b> — кто/что/когда по договоренностям\n" +
    "• 🔎 <b>Scout</b> — поиск по памяти проекта\n" +
    "• 📈 <b>Pulse</b> — состояние интеграций\n\n" +
    "<i>Совет: закрепите active проект и работайте через Commits/Scout.</i>"
  );
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "<code>UNKNOWN</code>";
  if (s === "open" || s === "active") return "<code>OPEN</code>";
  if (s === "paused" || s === "hold") return "<code>PAUSED</code>";
  if (s === "done" || s === "closed") return "<code>CLOSED</code>";
  return `<code>${escapeHtml(safeText(s, 12).toUpperCase())}</code>`;
}

function linkBadge(flag) {
  return flag ? "<code>linked</code>" : "<code>--</code>";
}

function projectHeadline(project, pid, withStatus = false) {
  const name = escapeHtml(project?.name || "—");
  if (!withStatus) return `<b>${name}</b>`;
  const ref = escapeHtml(shortId(pid || project?.project_id || "", 6, 4));
  return `<b>${name}</b> ${statusBadge(project?.status)} • <code>${ref}</code>`;
}
