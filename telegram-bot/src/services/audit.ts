import type { Env } from "../types";
import { db } from "../db/client";

export async function bestEffortAudit(
  env: Env,
  draftId: string | null,
  eventType: string,
  payload: unknown,
): Promise<void> {
  try {
    await db(env).from("audit_log").insert({
      draft_id: draftId,
      level: "info",
      event_type: eventType,
      message: null,
      payload,
      created_at: new Date().toISOString(),
    } as Record<string, unknown>);
  } catch {
    // audit must never block user flow
  }
}
