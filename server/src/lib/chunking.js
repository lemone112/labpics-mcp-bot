export function chunkText(text, chunkSize) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const out = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    out.push(clean.slice(i, i + chunkSize));
  }
  return out;
}

export function shortSnippet(text, len = 80) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= len) return s;
  return `${s.slice(0, len - 3)}...`;
}

export function toIsoTime(value) {
  if (value == null) return null;

  const asNumber = Number(value);
  let date = null;
  if (Number.isFinite(asNumber)) {
    const ms = asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber;
    date = new Date(ms);
  } else {
    date = new Date(String(value));
  }

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toPositiveInt(value, fallback, min = 1, max = 100_000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
