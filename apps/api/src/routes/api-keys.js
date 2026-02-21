import { generateApiKey } from "../infra/api-keys.js";
import { ApiError, sendError } from "../infra/api-contract.js";
import { getEffectiveRole } from "../infra/rbac.js";

function requireOwnerSession(request, reply) {
  const role = getEffectiveRole(request);
  if (role !== "owner" || request.apiKey) {
    return sendError(reply, request.requestId, new ApiError(403, "forbidden", "Only owner session can manage API keys"));
  }
  return null;
}

function sanitizeScopes(input) {
  const allowed = new Set(["read", "write", "admin"]);
  const source = Array.isArray(input) ? input : [];
  const unique = new Set();
  for (const item of source) {
    const scope = String(item || "").trim().toLowerCase();
    if (allowed.has(scope)) unique.add(scope);
  }
  if (unique.size === 0) unique.add("read");
  return Array.from(unique);
}

export function registerApiKeyRoutes(ctx) {
  const { registerGet, registerPost, pool } = ctx;

  // List API keys for the current project
  registerGet("/api-keys", async (request, reply) => {
    const roleErr = requireOwnerSession(request, reply);
    if (roleErr) return roleErr;

    const projectId = request.auth?.active_project_id;
    if (!projectId) {
      return sendError(reply, request.requestId, new ApiError(400, "project_required", "Active project required"));
    }

    const { rows } = await pool.query(
      `
        SELECT id, key_prefix, name, scopes, expires_at, last_used_at, created_at
        FROM api_keys
        WHERE project_id = $1::uuid
        ORDER BY created_at DESC
      `,
      [projectId]
    );

    reply.send({ ok: true, data: rows });
  });

  // Create a new API key
  registerPost("/api-keys", async (request, reply) => {
    const roleErr = requireOwnerSession(request, reply);
    if (roleErr) return roleErr;

    const projectId = request.auth?.active_project_id;
    const accountScopeId = request.auth?.account_scope_id;
    if (!projectId || !accountScopeId) {
      return sendError(reply, request.requestId, new ApiError(400, "project_required", "Active project required"));
    }

    const body = request.body || {};
    const name = String(body.name || "").trim().slice(0, 100) || "Unnamed key";
    const scopes = sanitizeScopes(body.scopes);
    const expiresAt = body.expires_at ? new Date(body.expires_at) : null;

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_expires_at", "Invalid expires_at date"));
    }

    const { raw, hash, prefix } = generateApiKey();

    await pool.query(
      `
        INSERT INTO api_keys (project_id, account_scope_id, key_hash, key_prefix, name, scopes, expires_at)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
      `,
      [projectId, accountScopeId, hash, prefix, name, scopes, expiresAt]
    );

    // Return the raw key only once — it cannot be retrieved later
    reply.code(201).send({
      ok: true,
      data: { key: raw, prefix, name, scopes, expires_at: expiresAt },
    });
  });

  // Delete an API key
  registerPost("/api-keys/revoke", async (request, reply) => {
    const roleErr = requireOwnerSession(request, reply);
    if (roleErr) return roleErr;

    const projectId = request.auth?.active_project_id;
    if (!projectId) {
      return sendError(reply, request.requestId, new ApiError(400, "project_required", "Active project required"));
    }

    const keyId = String(request.body?.id || "").trim();
    if (!keyId) {
      return sendError(reply, request.requestId, new ApiError(400, "id_required", "API key id required"));
    }

    const { rowCount } = await pool.query(
      "DELETE FROM api_keys WHERE id = $1::uuid AND project_id = $2::uuid",
      [keyId, projectId]
    );

    if (!rowCount) {
      return sendError(reply, request.requestId, new ApiError(404, "not_found", "API key not found"));
    }

    reply.send({ ok: true });
  });
}
