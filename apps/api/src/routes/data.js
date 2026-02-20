import { parseLimit, sendOk } from "../infra/api-contract.js";
import { requireProjectScope } from "../infra/scope.js";

/**
 * Contacts, conversations, messages routes.
 * @param {object} ctx
 */
export function registerDataRoutes(ctx) {
  const { registerGet, pool } = ctx;

  registerGet("/contacts", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 100, 500);
    const q = String(request.query?.q || "").trim();
    const hasFilter = q.length > 0;

    const { rows } = hasFilter
      ? await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            WHERE
              project_id = $1
              AND account_scope_id = $2
              AND (
                name ILIKE $3
                OR email ILIKE $3
                OR phone_number ILIKE $3
              )
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $4
          `,
          [scope.projectId, scope.accountScopeId, `%${q.replace(/[%_]/g, "\\$&")}%`, limit]
        )
      : await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            WHERE project_id = $1
              AND account_scope_id = $2
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $3
          `,
          [scope.projectId, scope.accountScopeId, limit]
        );

    return sendOk(reply, request.requestId, { contacts: rows });
  });

  registerGet("/conversations", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 100, 500);
    const { rows } = await pool.query(
      `
        SELECT
          id,
          account_id,
          conversation_id,
          contact_global_id,
          inbox_id,
          status,
          assignee_id,
          updated_at,
          created_at
        FROM cw_conversations
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, limit]
    );
    return sendOk(reply, request.requestId, { conversations: rows });
  });

  registerGet("/messages", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 100, 500);
    const conversationGlobalId = String(request.query?.conversation_global_id || "").trim();

    const { rows } = conversationGlobalId
      ? await pool.query(
          `
            SELECT
              id,
              conversation_global_id,
              contact_global_id,
              sender_type,
              private,
              left(content, 300) AS content_snippet,
              created_at,
              updated_at
            FROM cw_messages
            WHERE project_id = $1
              AND account_scope_id = $2
              AND conversation_global_id = $3
            ORDER BY created_at DESC NULLS LAST
            LIMIT $4
          `,
          [scope.projectId, scope.accountScopeId, conversationGlobalId, limit]
        )
      : await pool.query(
          `
            SELECT
              id,
              conversation_global_id,
              contact_global_id,
              sender_type,
              private,
              left(content, 300) AS content_snippet,
              created_at,
              updated_at
            FROM cw_messages
            WHERE project_id = $1
              AND account_scope_id = $2
            ORDER BY created_at DESC NULLS LAST
            LIMIT $3
          `,
          [scope.projectId, scope.accountScopeId, limit]
        );

    return sendOk(reply, request.requestId, { messages: rows });
  });
}
