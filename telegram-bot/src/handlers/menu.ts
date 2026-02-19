import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { menuKeyboard, draftKeyboard } from "../ui/keyboards";
import { renderHelp, renderDraftPreview, renderMenu } from "../ui/templates";
import { createStubDraft } from "../services/draft";
import { bestEffortAudit } from "../services/audit";
import { loadProfile } from "../services/profile";
import { renderProfile } from "../ui/templates";
import { profileKeyboard } from "../ui/keyboards";

export async function handleMenuCallback(
  env: Env,
  chatId: number,
  fromId: number,
  args: string[],
): Promise<void> {
  const key = args[0] ?? "home";

  if (key === "help") {
    await tgSendMessage(env, chatId, renderHelp(), menuKeyboard());
    return;
  }

  if (key === "profile") {
    const p = await loadProfile(env, fromId);
    await tgSendMessage(env, chatId, renderProfile(p), profileKeyboard());
    return;
  }

  if (key === "tasks" || key === "clients" || key === "design") {
    const draftId = await createStubDraft(env, null, chatId, `menu:${key}`);
    await bestEffortAudit(env, draftId, "menu.open", { key });
    await tgSendMessage(env, chatId, renderDraftPreview(draftId), draftKeyboard(draftId));
    return;
  }

  await tgSendMessage(env, chatId, renderMenu(), menuKeyboard());
}
