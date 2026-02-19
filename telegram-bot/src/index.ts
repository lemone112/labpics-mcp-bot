import type { Env, TelegramUpdate } from "./types";
import { handleCallback } from "./handlers/callback";
import { handleMessage } from "./handlers/message";
import { normalizeError, formatUserError } from "./errors";
import { tgSendMessage } from "./telegram";
import { isAllowed } from "./services/auth";
import { menuKeyboard } from "./ui/keyboards";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") return text("ok");
    if (url.pathname !== "/telegram/webhook") return text("not found", 404);
    if (request.method !== "POST") return text("method not allowed", 405);

    // Validate webhook secret to prevent spoofed updates (P1 security)
    const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const headerSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
      if (headerSecret !== webhookSecret) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    try {
      if (update.callback_query) {
        await handleCallback(env, update);
      } else if (update.message?.text) {
        await handleMessage(env, update);
      }

      return json({ ok: true });
    } catch (e) {
      const err = normalizeError(e);
      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
      const fromId = update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
      const allowed = fromId ? isAllowed(env, fromId) : false;

      if (chatId && allowed) {
        try {
          await tgSendMessage(env, chatId, formatUserError(err), menuKeyboard());
        } catch {
          // last resort — don't let error reporting break the webhook
        }
      }

      return json({ ok: true, error: err.code });
    }
  },
};
