// @ts-nocheck

export function btn(text, callback_data) {
  return { text, callback_data };
}

export function toReplyMarkup(rows) {
  return JSON.stringify({ inline_keyboard: rows });
}

export function shortId(id, left = 4, right = 4) {
  const s = String(id || "");
  if (s.length <= left + right + 1) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
