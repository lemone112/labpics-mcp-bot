import type { Env } from "../types";

export function getAllowedUserSet(env: Env): Set<number> | null {
  const raw = env.BOT_ALLOWED_TELEGRAM_USER_IDS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  return new Set(ids);
}

export function isAllowed(env: Env, telegramUserId: number): boolean {
  const allowed = getAllowedUserSet(env);
  if (!allowed) return false; // default deny
  return allowed.has(telegramUserId);
}
