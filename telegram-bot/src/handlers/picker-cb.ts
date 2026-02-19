import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { menuKeyboard, profileKeyboard } from "../ui/keyboards";
import { renderPicker, renderProfile } from "../ui/templates";
import { loadPickerState, savePickerState, navigatePicker } from "../services/picker";
import { loadProfile, setProfileField, profileKeys } from "../services/profile";
import { bestEffortAudit } from "../services/audit";
import { upsertSetting } from "../db/client";

export async function handlePickerCallback(
  env: Env,
  chatId: number,
  fromId: number,
  prefix: "PL" | "PA",
  action: string,
): Promise<void> {
  const state = await loadPickerState(env, fromId);
  if (!state) {
    await tgSendMessage(env, chatId, "Picker expired. Open Profile again.", menuKeyboard());
    return;
  }

  const result = navigatePicker(state, action);

  if (result.type === "pick") {
    const item = state.items[result.index];
    if (!item) {
      await tgSendMessage(env, chatId, "Invalid pick.", menuKeyboard());
      return;
    }

    if (prefix === "PL") {
      const keys = profileKeys(fromId);
      await upsertSetting(env, keys.linearUserId, item.id);
      await bestEffortAudit(env, null, "profile.set_linear", { tgUserId: fromId, linear_user_id: item.id });
    } else {
      const keys = profileKeys(fromId);
      await upsertSetting(env, keys.attioWorkspaceMemberId, item.id);
      await bestEffortAudit(env, null, "profile.set_attio", { tgUserId: fromId, attio_workspace_member_id: item.id });
    }

    const p = await loadProfile(env, fromId);
    await tgSendMessage(env, chatId, renderProfile(p), profileKeyboard());
    return;
  }

  // Navigate (prev/next)
  await savePickerState(env, fromId, state);
  const title = prefix === "PL" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, prefix);
  await tgSendMessage(env, chatId, view.text, view.keyboard);
}
