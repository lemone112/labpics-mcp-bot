/**
 * Resolve owner identity for transitional owner_username -> owner_user_id flow.
 *
 * Resolution order:
 *  1) explicit owner_user_id
 *  2) explicit owner_username
 *  3) auth user_id
 *  4) auth username
 */

import type { Pool } from "../../types/index.js";

type ResolveSource =
  | "owner_user_id"
  | "owner_username"
  | "auth_user_id"
  | "auth_username"
  | "none";

interface OwnerReferenceInput {
  ownerUserId?: string | null;
  ownerUsername?: string | null;
  authUserId?: string | null;
  authUsername?: string | null;
}

interface OwnerReferenceResult {
  ownerUserId: string | null;
  ownerUsername: string | null;
  source: ResolveSource;
  resolved: boolean;
  invalidOwnerUserId: string | null;
}

interface UserLookupRow {
  id: string;
  username: string | null;
}

export async function resolveOwnerReference(
  pool: Pool,
  input: OwnerReferenceInput = {}
): Promise<OwnerReferenceResult> {
  const ownerUserId = String(input.ownerUserId || "").trim();
  const ownerUsername = String(input.ownerUsername || "").trim().toLowerCase();
  const authUserId = String(input.authUserId || "").trim();
  const authUsername = String(input.authUsername || "").trim().toLowerCase();

  async function byUserId(userId: string, source: ResolveSource): Promise<OwnerReferenceResult | null> {
    if (!userId) return null;
    const { rows } = await pool.query<UserLookupRow>(
      `
        SELECT id::text AS id, username
        FROM app_users
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) {
      return {
        ownerUserId: null,
        ownerUsername: null,
        source,
        resolved: false,
        invalidOwnerUserId: userId,
      };
    }
    return {
      ownerUserId: row.id,
      ownerUsername: row.username || null,
      source,
      resolved: true,
      invalidOwnerUserId: null,
    };
  }

  async function byUsername(
    username: string,
    source: ResolveSource
  ): Promise<OwnerReferenceResult | null> {
    if (!username) return null;
    const { rows } = await pool.query<UserLookupRow>(
      `
        SELECT id::text AS id, username
        FROM app_users
        WHERE lower(username) = lower($1)
        LIMIT 1
      `,
      [username]
    );
    const row = rows[0];
    if (!row) {
      return {
        ownerUserId: null,
        ownerUsername: username,
        source,
        resolved: false,
        invalidOwnerUserId: null,
      };
    }
    return {
      ownerUserId: row.id,
      ownerUsername: row.username || username,
      source,
      resolved: true,
      invalidOwnerUserId: null,
    };
  }

  const explicitUser = await byUserId(ownerUserId, "owner_user_id");
  if (ownerUserId) {
    return (
      explicitUser || {
        ownerUserId: null,
        ownerUsername: null,
        source: "owner_user_id",
        resolved: false,
        invalidOwnerUserId: ownerUserId,
      }
    );
  }

  return (
    (await byUsername(ownerUsername, "owner_username")) ||
    (await byUserId(authUserId, "auth_user_id")) ||
    (await byUsername(authUsername, "auth_username")) || {
      ownerUserId: null,
      ownerUsername: null,
      source: "none",
      resolved: false,
      invalidOwnerUserId: null,
    }
  );
}
