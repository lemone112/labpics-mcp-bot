import type { Env, PickerItem, PickerKind, PickerState } from "../types";
import { db, getSetting, upsertSetting } from "../db/client";

const PICKER_PAGE_SIZE = 8;

function pickerStateKey(tgUserId: number): string {
  return `picker:${tgUserId}:state`;
}

export async function savePickerState(env: Env, tgUserId: number, state: PickerState): Promise<void> {
  await upsertSetting(env, pickerStateKey(tgUserId), state);
}

export async function loadPickerState(env: Env, tgUserId: number): Promise<PickerState | null> {
  return (await getSetting<PickerState>(env, pickerStateKey(tgUserId))) ?? null;
}

export async function buildLinearUserPicker(env: Env): Promise<PickerItem[]> {
  try {
    const { data } = await db(env)
      .from("linear_users_cache")
      .select("id,name,display_name,email,active")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(250);

    const rows = (data as Array<{ id: string; name?: string; display_name?: string; email?: string }>) ?? [];
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: String(r.id),
        label: String(r.name ?? r.display_name ?? r.id),
        subtitle: r.email ? String(r.email) : undefined,
      }));
    }
  } catch {
    // cache table may not exist yet
  }
  return [];
}

export async function buildAttioMemberPicker(_env: Env): Promise<PickerItem[]> {
  // Iteration 2: empty picker. Real Attio integration in Iteration 4.
  return [];
}

export function getMaxPage(items: PickerItem[]): number {
  return Math.max(1, Math.ceil(items.length / PICKER_PAGE_SIZE));
}

export function navigatePicker(
  state: PickerState,
  action: string,
): { type: "navigate" } | { type: "pick"; index: number } {
  const maxPage = getMaxPage(state.items);

  if (action === "prev") {
    state.page = Math.max(1, state.page - 1);
    return { type: "navigate" };
  }
  if (action === "next") {
    state.page = Math.min(maxPage, state.page + 1);
    return { type: "navigate" };
  }

  const n = Number(action);
  if (Number.isFinite(n) && n >= 1 && n <= PICKER_PAGE_SIZE) {
    const index = (state.page - 1) * PICKER_PAGE_SIZE + (n - 1);
    return { type: "pick", index };
  }

  return { type: "navigate" };
}
