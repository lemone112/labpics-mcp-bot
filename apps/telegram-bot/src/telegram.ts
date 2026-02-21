import type { Env, InlineKeyboardMarkup, TelegramApiResponse } from "./types";

function requireToken(env: Env): string {
  const t = env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("Missing env: TELEGRAM_BOT_TOKEN");
  return t;
}

export async function tgCall<T>(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${requireToken(env)}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as
    | TelegramApiResponse<T>
    | Record<string, unknown>;
  const okFlag = (data as TelegramApiResponse<T> & { ok?: boolean }).ok;

  if (!res.ok || okFlag === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }
  if (okFlag === true && "result" in data) return (data as TelegramApiResponse<T> & { ok: true }).result;
  return data as unknown as T;
}

export async function tgSendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<void> {
  await tgCall(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

export async function tgAnswerCallbackQuery(env: Env, callbackQueryId: string): Promise<void> {
  try {
    await tgCall(env, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    });
  } catch (err) {
    // Telegram requires answering within 30s; this can fail on network jitter / late callbacks
    console.warn("[telegram] answerCallbackQuery failed", { callbackQueryId }, err);
  }
}
