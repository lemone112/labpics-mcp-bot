import type { InlineKeyboardButton, InlineKeyboardMarkup } from "../types";

/** System navigation row present in every non-menu screen. */
export function sysNavRow(): InlineKeyboardButton[] {
  return [
    { text: "Menu", callback_data: "v1:SYS:MENU" },
    { text: "Cancel", callback_data: "v1:SYS:CANCEL" },
  ];
}

/** Main menu keyboard — entry point for all actions. */
export function menuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Tasks", callback_data: "v1:M:tasks" },
        { text: "Clients", callback_data: "v1:M:clients" },
      ],
      [
        { text: "Design Studio", callback_data: "v1:M:design" },
        { text: "Profile", callback_data: "v1:M:profile" },
      ],
      [{ text: "Help", callback_data: "v1:M:help" }],
    ],
  };
}

/** Draft preview — Apply / Cancel + system nav. */
export function draftKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Apply", callback_data: `v1:D:A:${draftId}` },
        { text: "Cancel", callback_data: `v1:D:C:${draftId}` },
      ],
      sysNavRow(),
    ],
  };
}

/** Profile management keyboard. */
export function profileKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Set Linear user", callback_data: "v1:P:linear:pick" },
        { text: "Set Attio member", callback_data: "v1:P:attio:pick" },
      ],
      [
        { text: "Clear Linear", callback_data: "v1:P:linear:clear" },
        { text: "Clear Attio", callback_data: "v1:P:attio:clear" },
      ],
      sysNavRow(),
    ],
  };
}
