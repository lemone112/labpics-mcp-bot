import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { menuKeyboard } from "../ui/keyboards";
import { renderMenu } from "../ui/templates";

export async function handleSystemCallback(env: Env, chatId: number, args: string[]): Promise<void> {
  const action = args[0];

  if (action === "MENU") {
    await tgSendMessage(env, chatId, renderMenu(), menuKeyboard());
    return;
  }

  if (action === "CANCEL") {
    await tgSendMessage(env, chatId, "Cancelled.", menuKeyboard());
    return;
  }

  await tgSendMessage(env, chatId, renderMenu(), menuKeyboard());
}
