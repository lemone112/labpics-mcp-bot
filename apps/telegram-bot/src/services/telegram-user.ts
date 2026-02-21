import type { Env, TelegramUser } from "../types";
import { db } from "../db/client";

export async function ensureTelegramUser(env: Env, tgUser: TelegramUser | undefined): Promise<string | null> {
  if (!tgUser) return null;
  try {
    const { data } = await db(env)
      .from("telegram_users")
      .upsert(
        {
          telegram_user_id: tgUser.id,
          username: tgUser.username ?? null,
          first_name: tgUser.first_name ?? null,
          last_name: tgUser.last_name ?? null,
          language_code: tgUser.language_code ?? null,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>,
        { onConflict: "telegram_user_id" },
      )
      .select("id")
      .maybeSingle();

    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.error("[telegram-user] failed to upsert telegram user", { telegramUserId: tgUser.id }, err);
    return null;
  }
}
