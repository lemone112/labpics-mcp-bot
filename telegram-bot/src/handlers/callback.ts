import type { Env, TelegramUpdate, ParsedCallback, CallbackOpValue } from "../types";
import { CallbackOp } from "../types";
import { tgSendMessage, tgAnswerCallbackQuery } from "../telegram";
import { isAllowed } from "../services/auth";
import { insertIdempotencyKey } from "../services/idempotency";
import { menuKeyboard, sysNavRow } from "../ui/keyboards";
import { renderNoAccess } from "../ui/templates";
import { handleSystemCallback } from "./system";
import { handleMenuCallback } from "./menu";
import { handleProfileCallback } from "./profile-cb";
import { handlePickerCallback } from "./picker-cb";
import { handleDraftCallback } from "./draft-cb";

const VALID_OPS = new Set<string>(Object.values(CallbackOp));

function parseCallback(raw: string | undefined): ParsedCallback | null {
  if (!raw?.startsWith("v1:")) return null;
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  const op = parts[1];
  if (!VALID_OPS.has(op)) return null;
  return { op: op as CallbackOpValue, args: parts.slice(2) };
}

export async function handleCallback(env: Env, update: TelegramUpdate): Promise<void> {
  const cq = update.callback_query;
  if (!cq) return;

  await tgAnswerCallbackQuery(env, cq.id);

  const fromId = cq.from.id;
  const chatId = cq.message?.chat.id;
  if (!chatId) return;

  if (!isAllowed(env, fromId)) {
    await tgSendMessage(env, chatId, renderNoAccess(), {
      inline_keyboard: [sysNavRow()],
    });
    return;
  }

  const cbKey = `tg:callback:${cq.id}`;
  const firstTime = await insertIdempotencyKey(env, cbKey, null);
  if (!firstTime) return;

  const parsed = parseCallback(cq.data);
  if (!parsed) {
    await tgSendMessage(env, chatId, "Unsupported button.", {
      inline_keyboard: [sysNavRow()],
    });
    return;
  }

  switch (parsed.op) {
    case CallbackOp.SYS:
      return handleSystemCallback(env, chatId, parsed.args);
    case CallbackOp.M:
      return handleMenuCallback(env, chatId, fromId, parsed.args);
    case CallbackOp.P:
      return handleProfileCallback(env, chatId, fromId, parsed.args);
    case CallbackOp.PL:
      return handlePickerCallback(env, chatId, fromId, "PL", parsed.args[0] ?? "");
    case CallbackOp.PA:
      return handlePickerCallback(env, chatId, fromId, "PA", parsed.args[0] ?? "");
    case CallbackOp.D:
      return handleDraftCallback(env, chatId, parsed.args);
    default:
      await tgSendMessage(env, chatId, "Unsupported action.", menuKeyboard());
  }
}
