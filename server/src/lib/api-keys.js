import crypto from "node:crypto";

/**
 * Generate a new API key.
 * Returns { raw, hash, prefix } — raw is shown once, hash is stored.
 */
export function generateApiKey() {
  const raw = `lp_${crypto.randomBytes(32).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 11); // "lp_" + first 8 chars
  return { raw, hash, prefix };
}

/**
 * Hash a raw API key for lookup.
 */
export function hashApiKey(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Middleware: if X-API-Key header is present, authenticate via hashed key lookup
 * instead of session cookie. Sets request.auth and request.apiKey.
 *
 * @param {import("pg").Pool} pool
 */
export function createApiKeyAuth(pool) {
  return async function apiKeyAuth(request) {
    const rawKey = request.headers["x-api-key"];
    if (!rawKey) return; // no API key — fall through to session auth

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

    const key = rows[0];
    if (!key) {
      throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    }

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      throw Object.assign(new Error("API key expired"), { statusCode: 401 });
    }

    // Touch last_used_at (fire-and-forget)
    pool.query(
      "UPDATE api_keys SET last_used_at = now() WHERE id = $1",
      [key.id]
    ).catch(() => {});

    request.auth = {
      username: `apikey:${key.name || key.id}`,
      active_project_id: key.project_id,
      account_scope_id: key.account_scope_id,
    };
    request.apiKey = {
      id: key.id,
      scopes: key.scopes || ["read"],
    };
  };
}

/**
 * Check if the request has a required scope.
 */
export function requireScope(scope) {
  return async function checkScope(request) {
    if (!request.apiKey) return; // session auth — no scope check
    if (!request.apiKey.scopes.includes(scope) && !request.apiKey.scopes.includes("admin")) {
      throw Object.assign(new Error(`API key lacks required scope: ${scope}`), { statusCode: 403 });
    }
  };
}
