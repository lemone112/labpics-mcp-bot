import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { menuKeyboard } from "../ui/keyboards";
import { cancelDraft, applyDraftStub } from "../services/draft";
import { bestEffortAudit } from "../services/audit";

export async function handleDraftCallback(
  env: Env,
  chatId: number,
  args: string[],
): Promise<void> {
  const action = args[0]; // "A" (Apply) | "C" (Cancel)
  const draftId = args[1];

  if (!draftId) {
    await tgSendMessage(env, chatId, "Invalid draft.", menuKeyboard());
    return;
  }

  if (action === "C") {
    await cancelDraft(env, draftId);
    await bestEffortAudit(env, draftId, "draft.cancel", {});
    await tgSendMessage(env, chatId, "Draft cancelled.", menuKeyboard());
    return;
  }

  if (action === "A") {
    const res = await applyDraftStub(env, draftId);
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
