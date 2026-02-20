import type { Env } from "../types";
import { db } from "../db/client";

export async function insertIdempotencyKey(
  env: Env,
  key: string,
  draftId?: string | null,
): Promise<boolean> {
  try {
    const { error } = await db(env).from("idempotency_keys").insert({
      key,
      draft_id: draftId ?? null,
      created_at: new Date().toISOString(),
    } as Record<string, unknown>);
    if (error) return false;
    return true;
  } catch (err) {
    console.error("[idempotency] failed to insert key", { key }, err);
    return false;
  }
}
