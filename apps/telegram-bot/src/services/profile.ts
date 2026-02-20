import type { Env, Profile } from "../types";
import { getSetting, upsertSetting } from "../db/client";

function profileKeys(tgUserId: number) {
  return {
    linearUserId: `profile:${tgUserId}:linear_user_id`,
    attioWorkspaceMemberId: `profile:${tgUserId}:attio_workspace_member_id`,
  };
}

export { profileKeys };

export async function loadProfile(env: Env, tgUserId: number): Promise<Profile> {
  const keys = profileKeys(tgUserId);
  const linear_user_id = await getSetting<string>(env, keys.linearUserId).catch(() => null);
  const attio_workspace_member_id = await getSetting<string>(env, keys.attioWorkspaceMemberId).catch(() => null);
  return {
    linear_user_id: linear_user_id ?? null,
    attio_workspace_member_id: attio_workspace_member_id ?? null,
  };
}

export async function setProfileField(
  env: Env,
  tgUserId: number,
  field: "linear" | "attio",
  value: string | null,
): Promise<void> {
  const keys = profileKeys(tgUserId);
  const key = field === "linear" ? keys.linearUserId : keys.attioWorkspaceMemberId;
  await upsertSetting(env, key, value);
}
