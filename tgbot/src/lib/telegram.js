// @ts-nocheck

export async function tgCall(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

export function tgSendMessage(env, chat_id, text, opts = {}) {
  return tgCall(env, "sendMessage", {
    chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...opts,
  });
}

export function tgAnswerCallbackQuery(env, callback_query_id, opts = {}) {
  return tgCall(env, "answerCallbackQuery", { callback_query_id, ...opts });
}
