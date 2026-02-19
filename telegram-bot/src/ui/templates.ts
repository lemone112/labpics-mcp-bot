import type { Profile, PickerState, InlineKeyboardButton, InlineKeyboardMarkup } from "../types";
import { sysNavRow } from "./keyboards";

export function renderMenu(): string {
  return ["Assistant", "", "Choose an action:"].join("\n");
}

export function renderHelp(): string {
  return [
    "Help",
    "",
    "This bot is in Iteration 2 (profile & pickers).",
    "Use Menu buttons.",
  ].join("\n");
}

export function renderNoAccess(): string {
  return "Нет доступа";
}

export function renderProfile(p: Profile): string {
  return [
    "Profile",
    "",
    `Linear user: ${p.linear_user_id ?? "(not set)"}`,
    `Attio member: ${p.attio_workspace_member_id ?? "(not set)"}`,
  ].join("\n");
}

export function renderDraftPreview(draftId: string): string {
  return [
    `Draft #${draftId.slice(0, 8)}`,
    "",
    "Summary:",
    "- Stub draft (Iteration 1)",
    "",
    "Steps:",
    "1) No-op (platform validation)",
    "",
    "Risks:",
    "- Platform-only: no business actions yet",
  ].join("\n");
}

const PICKER_PAGE_SIZE = 8;

export function renderPicker(
  title: string,
  state: PickerState,
  onPickPrefix: string,
): { text: string; keyboard: InlineKeyboardMarkup } {
  const start = (state.page - 1) * PICKER_PAGE_SIZE;
  const pageItems = state.items.slice(start, start + PICKER_PAGE_SIZE);

  const lines: string[] = [title, "", `Page ${state.page}`];
  pageItems.forEach((it, i) => {
    lines.push(`${i + 1}) ${it.label}${it.subtitle ? ` — ${it.subtitle}` : ""}`);
  });

  const pickRow: InlineKeyboardButton[] = pageItems.map((_, i) => ({
    text: `Pick ${i + 1}`,
    callback_data: `v1:${onPickPrefix}:${i + 1}`,
  }));

  const navRow: InlineKeyboardButton[] = [
    { text: "◀ Prev", callback_data: `v1:${onPickPrefix}:prev` },
    { text: "Next ▶", callback_data: `v1:${onPickPrefix}:next` },
  ];

  return {
    text: lines.join("\n"),
    keyboard: { inline_keyboard: [pickRow, navRow, sysNavRow()] },
  };
}
