// ── Number utilities ────────────────────────────────────────────

export function toPositiveInt(value, fallback, min = 1, max = 100_000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clampInt(value, fallback, min = 0, max = 1_000_000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function toNumber(value, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
}

// ── Date utilities ──────────────────────────────────────────────

export function toDate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

export function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function addDaysIso(base, days) {
  const date = base instanceof Date ? base : new Date(base);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Text utilities ──────────────────────────────────────────────

export function asText(value, maxLen = 2000) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLen) : null;
}

export function toBoolean(value, fallback = false) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export const boolFromEnv = toBoolean;

// ── Env utilities ──────────────────────────────────────────────

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
