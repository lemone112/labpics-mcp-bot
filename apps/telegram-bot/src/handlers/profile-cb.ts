import type { Env } from "../types";
import { tgSendMessage } from "../telegram";
import { profileKeyboard } from "../ui/keyboards";
import { renderProfile } from "../ui/templates";
import { loadProfile, setProfileField } from "../services/profile";
import { buildLinearUserPicker, buildAttioMemberPicker, savePickerState } from "../services/picker";
import { renderPicker } from "../ui/templates";
import { menuKeyboard } from "../ui/keyboards";

export async function handleProfileCallback(
  env: Env,
  chatId: number,
  fromId: number,
  args: string[],
): Promise<void> {
  const target = args[0]; // "linear" | "attio"
  const action = args[1]; // "pick" | "clear"

  if (target === "linear" && action === "pick") {
    await startPicker(env, chatId, fromId, "linear_user");
    return;
  }

  if (target === "attio" && action === "pick") {
    await startPicker(env, chatId, fromId, "attio_member");
    return;
  }

  if (target === "linear" && action === "clear") {
    await setProfileField(env, fromId, "linear", null);
    const p = await loadProfile(env, fromId);
    await tgSendMessage(env, chatId, renderProfile(p), profileKeyboard());
    return;
  }

  if (target === "attio" && action === "clear") {
    await setProfileField(env, fromId, "attio", null);
    const p = await loadProfile(env, fromId);
    await tgSendMessage(env, chatId, renderProfile(p), profileKeyboard());
    return;
  }
}

async function startPicker(env: Env, chatId: number, tgUserId: number, kind: "linear_user" | "attio_member"): Promise<void> {
  const items =
    kind === "linear_user"
      ? await buildLinearUserPicker(env)
      : await buildAttioMemberPicker(env);

  if (items.length === 0) {
    await tgSendMessage(
      env,
      chatId,
      "Picker is empty. Cache refresh will be implemented in Iteration 2.",
      menuKeyboard(),
    );
    return;
  }

  const state = { kind, page: 1, items };
  await savePickerState(env, tgUserId, state);

  const prefix = kind === "linear_user" ? "PL" : "PA";
  const title = kind === "linear_user" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, prefix);
  await tgSendMessage(env, chatId, view.text, view.keyboard);
}
