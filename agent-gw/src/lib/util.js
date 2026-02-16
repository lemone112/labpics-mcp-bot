// @ts-nocheck

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

export function shortId(id, left = 6, right = 4) {
  const s = String(id || "");
  if (s.length <= left + right + 1) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

export function snippetText(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
