import type { Env, DraftStatus } from "../types";
import { db } from "../db/client";
import { insertIdempotencyKey } from "./idempotency";

export async function createStubDraft(
  env: Env,
  telegramUserPk: string | null,
  chatId: number,
  sourceText: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const row: Record<string, unknown> = {
    telegram_user_id: telegramUserPk,
    chat_id: chatId,
    source_type: "text",
    source_text: sourceText,
    transcript: null,
    intent_summary: "Stub draft (Iteration 1)",
    status: "DRAFT" satisfies DraftStatus,
    assumptions: [],
    risks: [
      {
        kind: "missing_required",
        details:
          "Iteration 1: business actions are stubbed; this draft is only to validate the platform.",
      },
    ],
    questions: [],
    actions: [
      {
        toolkit: "supabase",
        tool_slug: "NOOP",
        args: {},
        read_only: false,
        idempotency_scope: "draft:apply:stub",
        preview: "No-op (platform validation)",
      },
    ],
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  };

  const { data, error } = await db(env)
    .from("drafts")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to create draft: ${error.message}`);
  return (data as { id: string }).id;
}

export async function cancelDraft(env: Env, draftId: string, telegramUserPk: string): Promise<boolean> {
  const { data } = await db(env)
    .from("drafts")
    .update({ status: "CANCELLED" satisfies DraftStatus, updated_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("id", draftId)
    .eq("telegram_user_id", telegramUserPk)
    .select("id")
    .maybeSingle();

  return data !== null;
}

export async function applyDraftStub(
  env: Env,
  draftId: string,
  telegramUserPk: string,
): Promise<{ alreadyApplied: boolean } | null> {
  // Verify ownership before applying
  const { data: draft } = await db(env)
    .from("drafts")
    .select("id")
    .eq("id", draftId)
    .eq("telegram_user_id", telegramUserPk)
    .maybeSingle();

  if (!draft) return null;

  const applyKey = `draft:${draftId}:apply`;
  const ok = await insertIdempotencyKey(env, applyKey, draftId);
  if (!ok) return { alreadyApplied: true };

  try {
    await db(env).from("draft_apply_attempts").insert({
      draft_id: draftId,
      idempotency_key: applyKey,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      result: { ok: true, note: "Iteration 1 stub apply" },
      error_summary: null,
    } as Record<string, unknown>);
  } catch {
    // non-critical
  }

  await db(env)
    .from("drafts")
    .update({ status: "APPLIED" satisfies DraftStatus, updated_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("id", draftId)
    .eq("telegram_user_id", telegramUserPk);

  return { alreadyApplied: false };
}
