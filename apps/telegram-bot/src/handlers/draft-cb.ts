import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { menuKeyboard } from "../ui/keyboards";
import { cancelDraft, applyDraftStub } from "../services/draft";
import { bestEffortAudit } from "../services/audit";
import { db } from "../db/client";

export async function handleDraftCallback(
  env: Env,
  chatId: number,
  fromId: number,
  args: string[],
): Promise<void> {
  const action = args[0]; // "A" (Apply) | "C" (Cancel)
  const draftId = args[1];

  if (!draftId) {
    await tgSendMessage(env, chatId, "Invalid draft.", menuKeyboard());
    return;
  }

  const { data: userRow } = await db(env)
    .from("telegram_users")
    .select("id")
    .eq("telegram_user_id", fromId)
    .maybeSingle();
  const userPk = (userRow as { id: string } | null)?.id ?? null;

  if (!userPk) {
    await tgSendMessage(env, chatId, "User not found.", menuKeyboard());
    return;
  }

  if (action === "C") {
    const cancelled = await cancelDraft(env, draftId, userPk);
    if (!cancelled) {
      await tgSendMessage(env, chatId, "Draft not found.", menuKeyboard());
      return;
    }
    await bestEffortAudit(env, draftId, "draft.cancel", {});
    await tgSendMessage(env, chatId, "Draft cancelled.", menuKeyboard());
    return;
  }

  if (action === "A") {
    const res = await applyDraftStub(env, draftId, userPk);
    if (!res) {
      await tgSendMessage(env, chatId, "Draft not found.", menuKeyboard());
      return;
    }
    await bestEffortAudit(env, draftId, "draft.apply", { alreadyApplied: res.alreadyApplied });
    await tgSendMessage(
      env,
      chatId,
      res.alreadyApplied ? "Already applied." : "Applied (stub).",
      menuKeyboard(),
    );
    return;
  }

  await tgSendMessage(env, chatId, "Unknown draft action.", menuKeyboard());
}
