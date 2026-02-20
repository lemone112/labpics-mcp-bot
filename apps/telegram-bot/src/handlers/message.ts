import type { Env, TelegramUpdate } from "../types";
import { tgSendMessage } from "../telegram";
import { isAllowed } from "../services/auth";
import { ensureTelegramUser } from "../services/telegram-user";
import { menuKeyboard } from "../ui/keyboards";
import { renderMenu, renderNoAccess } from "../ui/templates";

export async function handleMessage(env: Env, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  const chatId = msg.chat.id;

  if (!isAllowed(env, msg.from.id)) {
    await tgSendMessage(env, chatId, renderNoAccess());
    return;
  }

  await ensureTelegramUser(env, msg.from);
  await tgSendMessage(env, chatId, renderMenu(), menuKeyboard());
}
