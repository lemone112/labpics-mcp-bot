import { generateApiKey, sanitizeApiKeyScopes } from "../infra/api-keys.js";
import { ApiError, sendError } from "../infra/api-contract.js";
import { getEffectiveRole } from "../infra/rbac.js";
import { assertUuid } from "../infra/utils.js";
import type { Pool } from "../types/index.js";
import type { FastifyReply, FastifyRequest } from "fastify";

type RequestLike = FastifyRequest & {
  auth?: {
    active_project_id?: string | null;
    account_scope_id?: string | null;
  };
  apiKey?: { id: string; scopes?: string[] };
  body?: Record<string, unknown>;
  requestId?: string;
};

type ReplyLike = FastifyReply;

type RegisterFn = (path: string, handler: (request: RequestLike, reply: ReplyLike) => Promise<unknown> | unknown) => void;

interface RouteCtx {
  registerGet: RegisterFn;
  registerPost: RegisterFn;
  pool: Pool;
}

function requestIdOf(request: RequestLike): string {
  return String(request.requestId || request.id);
}

function requireOwnerSession(request: RequestLike, reply: ReplyLike) {
  const role = getEffectiveRole(request);
  if (role !== "owner" || request.apiKey) {
    return sendError(reply, requestIdOf(request), new ApiError(403, "forbidden", "Only owner session can manage API keys"));
  }
  return null;
}

export function registerApiKeyRoutes(ctx: RouteCtx) {
  const { registerGet, registerPost, pool } = ctx;

  // List API keys for the current project
  registerGet("/api-keys", async (request, reply) => {
    const roleErr = requireOwnerSession(request, reply);
    if (roleErr) return roleErr;

    const projectId = request.auth?.active_project_id;
    if (!projectId) {
      return sendError(reply, requestIdOf(request), new ApiError(400, "project_required", "Active project required"));
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
      return sendError(reply, requestIdOf(request), new ApiError(400, "project_required", "Active project required"));
    }

    const body = request.body || {};
    const name = String(body.name || "").trim().slice(0, 100) || "Unnamed key";
    const scopes = sanitizeApiKeyScopes(body.scopes);
    const expiresAt = body.expires_at ? new Date(String(body.expires_at)) : null;

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return sendError(reply, requestIdOf(request), new ApiError(400, "invalid_expires_at", "Invalid expires_at date"));
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
      return sendError(reply, requestIdOf(request), new ApiError(400, "project_required", "Active project required"));
    }

    const rawKeyId = String(request.body?.id || "").trim();
    if (!rawKeyId) {
      return sendError(reply, requestIdOf(request), new ApiError(400, "id_required", "API key id required"));
    }
    const keyId = assertUuid(rawKeyId, "api_key_id");

    const { rowCount } = await pool.query(
      "DELETE FROM api_keys WHERE id = $1::uuid AND project_id = $2::uuid",
      [keyId, projectId]
    );

    if (!rowCount) {
      return sendError(reply, requestIdOf(request), new ApiError(404, "not_found", "API key not found"));
    }

    reply.send({ ok: true });
  });
}
