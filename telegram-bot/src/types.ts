// ── Environment ──────────────────────────────────────────────

export type Env = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMPOSIO_API_KEY: string;
  COMPOSIO_BASE_URL?: string;
  SUPABASE_SCHEMA?: string;
  BOT_ALLOWED_TELEGRAM_USER_IDS?: string;
  PAUSE_REMINDER_DAYS?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

// ── Telegram API ─────────────────────────────────────────────

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: { message_id: number; chat: TelegramChat };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

export type InlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

// ── Callback routing ─────────────────────────────────────────

export const CallbackOp = {
  SYS: "SYS",
  M: "M",
  P: "P",
  PL: "PL",
  PA: "PA",
  D: "D",
} as const;

export type CallbackOpValue = (typeof CallbackOp)[keyof typeof CallbackOp];

export type ParsedCallback = {
  op: CallbackOpValue;
  args: string[];
};

// ── Domain models ────────────────────────────────────────────

export type Profile = {
  linear_user_id: string | null;
  attio_workspace_member_id: string | null;
};

export type PickerItem = {
  id: string;
  label: string;
  subtitle?: string;
};

export type PickerKind = "linear_user" | "attio_member";

export type PickerState = {
  kind: PickerKind;
  page: number;
  items: PickerItem[];
};

export type DraftStatus = "DRAFT" | "APPLIED" | "CANCELLED";
