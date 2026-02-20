// ── Number utilities ────────────────────────────────────────────

export function toPositiveInt(value: unknown, fallback: number, min = 1, max = 100_000): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clampInt(value: unknown, fallback: number, min = 0, max = 1_000_000): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function toNumber(value: unknown, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function round(value: unknown, digits = 2): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
}

// ── Date utilities ──────────────────────────────────────────────

export function toDate(value: unknown, fallback: Date | null = null): Date | null {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function addDaysIso(base: Date | string | number, days: number): string {
  const date = base instanceof Date ? base : new Date(base);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Text utilities ──────────────────────────────────────────────

export function asText(value: unknown, maxLen = 2000): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLen) : null;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export const boolFromEnv = toBoolean;

// ── Env utilities ──────────────────────────────────────────────

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
