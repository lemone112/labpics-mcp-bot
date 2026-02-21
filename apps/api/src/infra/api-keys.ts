import crypto from "node:crypto";
import type { Pool } from "../types/index.js";
import type { Role } from "./rbac.js";

interface GeneratedApiKey {
  raw: string;
  hash: string;
  prefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const raw = `lp_${crypto.randomBytes(32).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 11);
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
  auth?: {
    username: string;
    active_project_id: string;
    account_scope_id: string;
    session_id?: string;
    user_id?: string | null;
    user_role?: Role;
  };
  apiKey?: {
    id: string;
    scopes: string[];
  };
}

export function sanitizeApiKeyScopes(scopes: unknown): string[] {
  const raw = Array.isArray(scopes) ? scopes : [];
  const allowed = new Set(["read", "write", "admin"]);
  const unique = new Set<string>();
  for (const scope of raw) {
    const normalized = String(scope || "").trim().toLowerCase();
    if (!allowed.has(normalized)) continue;
    unique.add(normalized);
  }
  if (unique.size === 0) {
    unique.add("read");
  }
  return Array.from(unique);
}

export function createApiKeyAuth(pool: Pool, logger: Console | { warn: (...args: unknown[]) => void } = console) {
  return async function apiKeyAuth(request: RequestWithHeaders): Promise<void> {
    const rawKey = request.headers["x-api-key"] as string | undefined;
    if (!rawKey) return;

    const keyHash = hashApiKey(rawKey);
    const { rows } = await pool.query(
      `
        SELECT
          id, project_id::text AS project_id,
          account_scope_id::text AS account_scope_id,
          name, scopes, expires_at
        FROM api_keys
        WHERE key_hash = $1
      `,
      [keyHash]
    );

    const key = rows[0] as { id: string; project_id: string; account_scope_id: string; name: string; scopes: string[] | null; expires_at: string | null } | undefined;
    if (!key) {
      throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    }

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      throw Object.assign(new Error("API key expired"), { statusCode: 401 });
    }

    const normalizedScopes = sanitizeApiKeyScopes(key.scopes);
    const userRole: Role = normalizedScopes.includes("admin") ? "owner" : "pm";

    pool.query(
      "UPDATE api_keys SET last_used_at = now() WHERE id = $1",
      [key.id]
    ).catch((err: unknown) => {
      logger.warn?.({ action: "api_key_last_used_update_failed", key_id: key.id, error: String((err as Error)?.message || err) });
    });

    request.auth = {
      username: `apikey:${key.name || key.id}`,
      active_project_id: key.project_id,
      account_scope_id: key.account_scope_id,
      user_id: null,
      user_role: userRole,
    };
    request.apiKey = {
      id: key.id,
      scopes: normalizedScopes,
    };
  };
}

export function requireScope(scope: string) {
  return async function checkScope(request: RequestWithHeaders): Promise<void> {
    if (!request.apiKey) return;
    if (!request.apiKey.scopes.includes(scope) && !request.apiKey.scopes.includes("admin")) {
      throw Object.assign(new Error(`API key lacks required scope: ${scope}`), { statusCode: 403 });
    }
  };
}
