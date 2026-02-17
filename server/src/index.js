import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import { createDbPool } from "./lib/db.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { runChatwootSync } from "./services/chatwoot.js";
import { runEmbeddings, searchChunks } from "./services/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "./services/jobs.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getAuthConfig() {
  const username = process.env.AUTH_USERNAME || process.env.ADMIN_USERNAME;
  const password = process.env.AUTH_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing auth credentials. Set AUTH_USERNAME and AUTH_PASSWORD.");
  }
  return { username, password };
}

function toTopK(value, fallback = 10) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 50));
}

function toLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, max));
}

function isUuid(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

const COMMITMENT_STATUSES = new Set(["active", "proposed", "closed", "done", "cancelled"]);
const COMMITMENT_OWNERS = new Set(["studio", "client", "unknown"]);
const COMMITMENT_CONFIDENCE = new Set(["high", "medium", "low"]);
const SOURCE_TYPES = new Set(["chatwoot_inbox"]);

function toTimestampOrNull(value) {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toCommitmentStatus(value, fallback = "proposed") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return COMMITMENT_STATUSES.has(normalized) ? normalized : null;
}

function toCommitmentOwner(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return COMMITMENT_OWNERS.has(normalized) ? normalized : null;
}

function toCommitmentConfidence(value, fallback = "medium") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return COMMITMENT_CONFIDENCE.has(normalized) ? normalized : null;
}

function toSourceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return SOURCE_TYPES.has(normalized) ? normalized : null;
}

function toEvidenceList(value, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const normalized = String(item || "").trim();
    if (!normalized) continue;
    result.push(normalized.slice(0, 250));
    if (result.length >= maxItems) break;
  }
  return result;
}

function requireActiveProject(request, reply) {
  const projectId = String(request.auth?.active_project_id || "").trim();
  if (!projectId) {
    reply.code(400).send({ ok: false, error: "active_project_required", request_id: request.requestId });
    return null;
  }
  return projectId;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const auth = getAuthConfig();
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "0.0.0.0";
  const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
    bodyLimit: 64 * 1024,
    disableRequestLogging: false,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });

  const pool = createDbPool(databaseUrl);
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const migrationsDir = path.join(currentDir, "..", "db", "migrations");
  await applyMigrations(pool, migrationsDir, app.log);

  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 14,
  };

  app.addHook("onRequest", async (request, reply) => {
    const requestId = String(request.headers["x-request-id"] || request.id);
    request.requestId = requestId;
    reply.header("x-request-id", requestId);

    const pathName = request.url.split("?")[0];
    const isPublic = pathName === "/health" || pathName.startsWith("/auth/");
    if (isPublic) return;

    const sid = request.cookies?.[cookieName];
    if (!sid) {
      return reply.code(401).send({ ok: false, error: "unauthorized", request_id: requestId });
    }

    const { rows } = await pool.query(
      `
        SELECT session_id, username, active_project_id
        FROM sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [sid]
    );
    if (!rows[0]) {
      reply.clearCookie(cookieName, cookieOptions);
      return reply.code(401).send({ ok: false, error: "unauthorized", request_id: requestId });
    }

    request.auth = rows[0];
    await pool.query("UPDATE sessions SET last_seen_at = now() WHERE session_id = $1", [sid]);
  });

  app.get("/health", async (request) => {
    return { ok: true, service: "server", request_id: request.requestId };
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    if (username !== auth.username || password !== auth.password) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials", request_id: request.requestId });
    }

    const sid = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `
        INSERT INTO sessions(session_id, username, active_project_id, created_at, last_seen_at)
        VALUES($1, $2, NULL, now(), now())
      `,
      [sid, username]
    );

    reply.setCookie(cookieName, sid, cookieOptions);
    return { ok: true, username, active_project_id: null, request_id: request.requestId };
  });

  app.post("/auth/logout", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (sid) await pool.query("DELETE FROM sessions WHERE session_id = $1", [sid]);
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true, request_id: request.requestId };
  });

  app.get("/auth/me", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (!sid) return { authenticated: false, request_id: request.requestId };

    const { rows } = await pool.query(
      `
        SELECT session_id, username, active_project_id, created_at, last_seen_at
        FROM sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [sid]
    );
    if (!rows[0]) {
      reply.clearCookie(cookieName, cookieOptions);
      return { authenticated: false, request_id: request.requestId };
    }

    return {
      authenticated: true,
      username: rows[0].username,
      active_project_id: rows[0].active_project_id,
      created_at: rows[0].created_at,
      last_seen_at: rows[0].last_seen_at,
      request_id: request.requestId,
    };
  });

  app.get("/projects", async (request) => {
    const { rows } = await pool.query("SELECT id, name, created_at FROM projects ORDER BY created_at DESC");
    return {
      ok: true,
      projects: rows,
      active_project_id: request.auth?.active_project_id || null,
      request_id: request.requestId,
    };
  });

  app.post("/projects", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const name = String(body?.name || "").trim();
    if (name.length < 2 || name.length > 160) {
      return reply.code(400).send({ ok: false, error: "invalid_name", request_id: request.requestId });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO projects(name)
        VALUES ($1)
        RETURNING id, name, created_at
      `,
      [name]
    );

    return { ok: true, project: rows[0], request_id: request.requestId };
  });

  app.post("/projects/:id/select", async (request, reply) => {
    const projectId = String(request.params?.id || "");
    const sid = request.auth?.session_id;
    if (!projectId || !isUuid(projectId)) {
      return reply.code(400).send({ ok: false, error: "invalid_project_id", request_id: request.requestId });
    }

    const project = await pool.query("SELECT id, name FROM projects WHERE id = $1 LIMIT 1", [projectId]);
    if (!project.rows[0]) {
      return reply.code(404).send({ ok: false, error: "project_not_found", request_id: request.requestId });
    }

    await pool.query("UPDATE sessions SET active_project_id = $2, last_seen_at = now() WHERE session_id = $1", [sid, projectId]);
    return { ok: true, active_project_id: projectId, project: project.rows[0], request_id: request.requestId };
  });

  app.get("/project-links", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const sourceTypeRaw = String(request.query?.source_type || "").trim();
    const sourceType = sourceTypeRaw ? toSourceType(sourceTypeRaw) : null;
    if (sourceTypeRaw && !sourceType) {
      return reply.code(400).send({ ok: false, error: "invalid_source_type", request_id: request.requestId });
    }

    const { rows } = await pool.query(
      `
        SELECT
          id,
          project_id,
          source_type,
          source_account_id,
          source_external_id,
          source_url,
          created_by,
          metadata,
          is_active,
          created_at,
          updated_at
        FROM project_source_links
        WHERE project_id = $1::uuid
          AND is_active = true
          AND ($2::text IS NULL OR source_type = $2::text)
        ORDER BY source_type ASC, source_external_id ASC
      `,
      [projectId, sourceType]
    );

    return { ok: true, links: rows, request_id: request.requestId };
  });

  app.post("/project-links", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const sourceType = toSourceType(body?.source_type);
    if (!sourceType) {
      return reply.code(400).send({ ok: false, error: "invalid_source_type", request_id: request.requestId });
    }

    const sourceExternalId = String(body?.source_external_id || "").trim();
    if (!sourceExternalId) {
      return reply.code(400).send({ ok: false, error: "invalid_source_external_id", request_id: request.requestId });
    }
    if (sourceType === "chatwoot_inbox" && !/^\d{1,18}$/.test(sourceExternalId)) {
      return reply.code(400).send({ ok: false, error: "invalid_source_external_id", request_id: request.requestId });
    }

    const sourceAccountId = String(body?.source_account_id || process.env.CHATWOOT_ACCOUNT_ID || "").trim();
    if (!sourceAccountId) {
      return reply.code(400).send({ ok: false, error: "invalid_source_account_id", request_id: request.requestId });
    }

    const sourceUrlRaw = body?.source_url == null ? "" : String(body.source_url).trim();
    const sourceUrl = sourceUrlRaw ? sourceUrlRaw.slice(0, 400) : null;
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    const existing = await pool.query(
      `
        SELECT
          id,
          project_id,
          source_type,
          source_account_id,
          source_external_id,
          source_url,
          created_by,
          metadata,
          is_active,
          created_at,
          updated_at
        FROM project_source_links
        WHERE source_type = $1
          AND source_account_id = $2
          AND source_external_id = $3
        LIMIT 1
      `,
      [sourceType, sourceAccountId, sourceExternalId]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].project_id !== projectId) {
        return reply.code(409).send({
          ok: false,
          error: "source_already_linked_to_other_project",
          linked_project_id: existing.rows[0].project_id,
          request_id: request.requestId,
        });
      }

      return { ok: true, link: existing.rows[0], created: false, request_id: request.requestId };
    }

    const { rows } = await pool.query(
      `
        INSERT INTO project_source_links(
          project_id,
          source_type,
          source_account_id,
          source_external_id,
          source_url,
          created_by,
          metadata,
          is_active,
          created_at,
          updated_at
        )
        VALUES($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, true, now(), now())
        RETURNING
          id,
          project_id,
          source_type,
          source_account_id,
          source_external_id,
          source_url,
          created_by,
          metadata,
          is_active,
          created_at,
          updated_at
      `,
      [projectId, sourceType, sourceAccountId, sourceExternalId, sourceUrl, request.auth?.username || null, JSON.stringify(metadata)]
    );

    return { ok: true, link: rows[0], created: true, request_id: request.requestId };
  });

  app.delete("/project-links/:id", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const linkId = String(request.params?.id || "").trim();
    if (!isUuid(linkId)) {
      return reply.code(400).send({ ok: false, error: "invalid_link_id", request_id: request.requestId });
    }

    const { rows } = await pool.query(
      `
        DELETE FROM project_source_links
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        RETURNING id
      `,
      [linkId, projectId]
    );

    if (!rows[0]) {
      return reply.code(404).send({ ok: false, error: "link_not_found", request_id: request.requestId });
    }

    return { ok: true, deleted_id: linkId, request_id: request.requestId };
  });

  app.get("/commitments", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const limit = toLimit(request.query?.limit, 100, 500);
    const statusRaw = String(request.query?.status || "").trim().toLowerCase();
    const statusFilter = statusRaw ? toCommitmentStatus(statusRaw, null) : null;
    if (statusRaw && !statusFilter) {
      return reply.code(400).send({ ok: false, error: "invalid_status", request_id: request.requestId });
    }

    const { rows } = await pool.query(
      `
        SELECT
          id,
          project_id,
          title,
          owner,
          due_at,
          status,
          confidence,
          summary,
          evidence,
          source,
          created_at,
          updated_at
        FROM commitments
        WHERE project_id = $1::uuid
          AND ($2::text IS NULL OR status = $2::text)
        ORDER BY
          CASE status
            WHEN 'active' THEN 0
            WHEN 'proposed' THEN 1
            WHEN 'done' THEN 2
            WHEN 'closed' THEN 3
            ELSE 4
          END,
          due_at ASC NULLS LAST,
          updated_at DESC
        LIMIT $3
      `,
      [projectId, statusFilter, limit]
    );

    return { ok: true, commitments: rows, request_id: request.requestId };
  });

  app.post("/commitments", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const title = String(body?.title || "").trim();
    if (title.length < 3 || title.length > 300) {
      return reply.code(400).send({ ok: false, error: "invalid_title", request_id: request.requestId });
    }

    const owner = toCommitmentOwner(body?.owner, "unknown");
    const status = toCommitmentStatus(body?.status, "proposed");
    const confidence = toCommitmentConfidence(body?.confidence, "medium");
    if (!owner) return reply.code(400).send({ ok: false, error: "invalid_owner", request_id: request.requestId });
    if (!status) return reply.code(400).send({ ok: false, error: "invalid_status", request_id: request.requestId });
    if (!confidence) return reply.code(400).send({ ok: false, error: "invalid_confidence", request_id: request.requestId });

    const dueAtProvided = Object.prototype.hasOwnProperty.call(body, "due_at");
    const dueAt = toTimestampOrNull(body?.due_at);
    if (dueAtProvided && body?.due_at && !dueAt) {
      return reply.code(400).send({ ok: false, error: "invalid_due_at", request_id: request.requestId });
    }

    if (Object.prototype.hasOwnProperty.call(body, "evidence") && !Array.isArray(body?.evidence)) {
      return reply.code(400).send({ ok: false, error: "invalid_evidence", request_id: request.requestId });
    }

    const summaryRaw = body?.summary == null ? "" : String(body.summary);
    const summary = summaryRaw.trim() ? summaryRaw.trim().slice(0, 2000) : null;
    const evidence = toEvidenceList(body?.evidence);
    const source = body?.source ? String(body.source).trim().slice(0, 100) : "manual";

    const { rows } = await pool.query(
      `
        INSERT INTO commitments(
          project_id, title, owner, due_at, status, confidence, summary, evidence, source, created_at, updated_at
        )
        VALUES($1::uuid, $2, $3, $4::timestamptz, $5, $6, $7, $8::jsonb, $9, now(), now())
        RETURNING
          id,
          project_id,
          title,
          owner,
          due_at,
          status,
          confidence,
          summary,
          evidence,
          source,
          created_at,
          updated_at
      `,
      [projectId, title, owner, dueAt, status, confidence, summary, JSON.stringify(evidence), source]
    );

    return { ok: true, commitment: rows[0], request_id: request.requestId };
  });

  app.patch("/commitments/:id", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const commitmentId = String(request.params?.id || "").trim();
    if (!commitmentId || !isUuid(commitmentId)) {
      return reply.code(400).send({ ok: false, error: "invalid_commitment_id", request_id: request.requestId });
    }

    const existing = await pool.query(
      `
        SELECT
          id,
          project_id,
          title,
          owner,
          due_at,
          status,
          confidence,
          summary,
          evidence,
          source
        FROM commitments
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        LIMIT 1
      `,
      [commitmentId, projectId]
    );
    if (!existing.rows[0]) {
      return reply.code(404).send({ ok: false, error: "commitment_not_found", request_id: request.requestId });
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const current = existing.rows[0];

    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasOwner = Object.prototype.hasOwnProperty.call(body, "owner");
    const hasStatus = Object.prototype.hasOwnProperty.call(body, "status");
    const hasConfidence = Object.prototype.hasOwnProperty.call(body, "confidence");
    const hasSummary = Object.prototype.hasOwnProperty.call(body, "summary");
    const hasEvidence = Object.prototype.hasOwnProperty.call(body, "evidence");
    const hasDueAt = Object.prototype.hasOwnProperty.call(body, "due_at");

    const nextTitle = hasTitle ? String(body?.title || "").trim() : current.title;
    if (!nextTitle || nextTitle.length < 3 || nextTitle.length > 300) {
      return reply.code(400).send({ ok: false, error: "invalid_title", request_id: request.requestId });
    }

    const nextOwner = hasOwner ? toCommitmentOwner(body?.owner, null) : current.owner;
    if (!nextOwner) return reply.code(400).send({ ok: false, error: "invalid_owner", request_id: request.requestId });

    const nextStatus = hasStatus ? toCommitmentStatus(body?.status, null) : current.status;
    if (!nextStatus) return reply.code(400).send({ ok: false, error: "invalid_status", request_id: request.requestId });

    const nextConfidence = hasConfidence ? toCommitmentConfidence(body?.confidence, null) : current.confidence;
    if (!nextConfidence) {
      return reply.code(400).send({ ok: false, error: "invalid_confidence", request_id: request.requestId });
    }

    const nextDueAt = hasDueAt ? toTimestampOrNull(body?.due_at) : toTimestampOrNull(current.due_at);
    if (hasDueAt && body?.due_at && !nextDueAt) {
      return reply.code(400).send({ ok: false, error: "invalid_due_at", request_id: request.requestId });
    }

    if (hasEvidence && !Array.isArray(body?.evidence)) {
      return reply.code(400).send({ ok: false, error: "invalid_evidence", request_id: request.requestId });
    }
    const nextEvidence = hasEvidence ? toEvidenceList(body?.evidence) : current.evidence;
    const nextSummary = hasSummary
      ? (String(body?.summary || "").trim().slice(0, 2000) || null)
      : current.summary;

    const { rows } = await pool.query(
      `
        UPDATE commitments
        SET
          title = $3,
          owner = $4,
          due_at = $5::timestamptz,
          status = $6,
          confidence = $7,
          summary = $8,
          evidence = $9::jsonb,
          updated_at = now()
        WHERE id = $1::uuid
          AND project_id = $2::uuid
        RETURNING
          id,
          project_id,
          title,
          owner,
          due_at,
          status,
          confidence,
          summary,
          evidence,
          source,
          created_at,
          updated_at
      `,
      [commitmentId, projectId, nextTitle, nextOwner, nextDueAt, nextStatus, nextConfidence, nextSummary, JSON.stringify(nextEvidence)]
    );

    return { ok: true, commitment: rows[0], request_id: request.requestId };
  });

  app.get("/contacts", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const limit = toLimit(request.query?.limit, 100, 500);
    const q = String(request.query?.q || "").trim();
    const hasFilter = q.length > 0;
    const escapedFilter = `%${q.replace(/[%_]/g, "\\$&")}%`;

    const { rows } = hasFilter
      ? await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            WHERE
              (
                name ILIKE $2
                OR email ILIKE $2
                OR phone_number ILIKE $2
              )
              AND EXISTS (
                SELECT 1
                FROM cw_messages AS m
                JOIN cw_conversations AS c ON c.id = m.conversation_global_id
                JOIN project_source_links AS psl
                  ON psl.source_type = 'chatwoot_inbox'
                 AND psl.source_account_id = c.account_id::text
                 AND psl.source_external_id = c.inbox_id::text
                 AND psl.project_id = $1::uuid
                 AND psl.is_active = true
                WHERE m.contact_global_id = cw_contacts.id
              )
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $3
          `,
          [projectId, escapedFilter, limit]
        )
      : await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            WHERE EXISTS (
              SELECT 1
              FROM cw_messages AS m
              JOIN cw_conversations AS c ON c.id = m.conversation_global_id
              JOIN project_source_links AS psl
                ON psl.source_type = 'chatwoot_inbox'
               AND psl.source_account_id = c.account_id::text
               AND psl.source_external_id = c.inbox_id::text
               AND psl.project_id = $1::uuid
               AND psl.is_active = true
              WHERE m.contact_global_id = cw_contacts.id
            )
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $2
          `,
          [projectId, limit]
        );

    return { ok: true, contacts: rows, request_id: request.requestId };
  });

  app.get("/conversations", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const limit = toLimit(request.query?.limit, 100, 500);
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
        WHERE inbox_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM project_source_links AS psl
            WHERE psl.project_id = $1::uuid
              AND psl.source_type = 'chatwoot_inbox'
              AND psl.source_account_id = cw_conversations.account_id::text
              AND psl.source_external_id = cw_conversations.inbox_id::text
              AND psl.is_active = true
          )
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT $2
      `,
      [projectId, limit]
    );
    return { ok: true, conversations: rows, request_id: request.requestId };
  });

  app.get("/messages", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const limit = toLimit(request.query?.limit, 100, 500);
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
            JOIN cw_conversations AS c ON c.id = cw_messages.conversation_global_id
            WHERE conversation_global_id = $2
              AND EXISTS (
                SELECT 1
                FROM project_source_links AS psl
                WHERE psl.project_id = $1::uuid
                  AND psl.source_type = 'chatwoot_inbox'
                  AND psl.source_account_id = c.account_id::text
                  AND psl.source_external_id = c.inbox_id::text
                  AND psl.is_active = true
              )
            ORDER BY created_at DESC NULLS LAST
            LIMIT $3
          `,
          [projectId, conversationGlobalId, limit]
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
            JOIN cw_conversations AS c ON c.id = cw_messages.conversation_global_id
            WHERE EXISTS (
              SELECT 1
              FROM project_source_links AS psl
              WHERE psl.project_id = $1::uuid
                AND psl.source_type = 'chatwoot_inbox'
                AND psl.source_account_id = c.account_id::text
                AND psl.source_external_id = c.inbox_id::text
                AND psl.is_active = true
            )
            ORDER BY created_at DESC NULLS LAST
            LIMIT $2
          `,
          [projectId, limit]
        );

    return { ok: true, messages: rows, request_id: request.requestId };
  });

  app.post("/jobs/chatwoot/sync", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const job = await startJob(pool, "chatwoot_sync", projectId);
    try {
      const result = await runChatwootSync(pool, projectId, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed_messages,
        meta: result,
      });
      return { ok: true, result, request_id: request.requestId };
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "chatwoot sync job failed");
      return reply.code(500).send({ ok: false, error: "chatwoot_sync_failed", request_id: request.requestId });
    }
  });

  app.post("/jobs/embeddings/run", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const job = await startJob(pool, "embeddings_run", projectId);
    try {
      const result = await runEmbeddings(pool, projectId, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed,
        meta: result,
      });
      return { ok: true, result, request_id: request.requestId };
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "embeddings job failed");
      return reply.code(500).send({ ok: false, error: "embeddings_job_failed", request_id: request.requestId });
    }
  });

  app.get("/jobs/status", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const status = await getJobsStatus(pool, projectId);
    return { ok: true, ...status, request_id: request.requestId };
  });

  app.post("/search", async (request, reply) => {
    const projectId = requireActiveProject(request, reply);
    if (!projectId) return;

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const query = String(body?.query || "").trim();
    const topK = toTopK(body?.topK, 10);

    if (!query) {
      return reply.code(400).send({ ok: false, error: "query_required", request_id: request.requestId });
    }

    const result = await searchChunks(pool, query, topK, projectId, request.log);
    return { ok: true, ...result, request_id: request.requestId };
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: String(error?.message || error), request_id: request.requestId }, "unhandled request error");
    reply.code(500).send({ ok: false, error: "internal_error", request_id: request.requestId });
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  await app.listen({ host, port });
  app.log.info({ host, port }, "server started");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
