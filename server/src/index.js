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
    if (!projectId) return reply.code(400).send({ ok: false, error: "invalid_project_id", request_id: request.requestId });

    const project = await pool.query("SELECT id, name FROM projects WHERE id = $1 LIMIT 1", [projectId]);
    if (!project.rows[0]) {
      return reply.code(404).send({ ok: false, error: "project_not_found", request_id: request.requestId });
    }

    await pool.query("UPDATE sessions SET active_project_id = $2, last_seen_at = now() WHERE session_id = $1", [sid, projectId]);
    return { ok: true, active_project_id: projectId, project: project.rows[0], request_id: request.requestId };
  });

  app.get("/contacts", async (request) => {
    const limit = toLimit(request.query?.limit, 100, 500);
    const q = String(request.query?.q || "").trim();
    const hasFilter = q.length > 0;

    const { rows } = hasFilter
      ? await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            WHERE
              name ILIKE $1
              OR email ILIKE $1
              OR phone_number ILIKE $1
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $2
          `,
          [`%${q.replace(/[%_]/g, "\\$&")}%`, limit]
        )
      : await pool.query(
          `
            SELECT
              id, account_id, contact_id, name, email, phone_number, identifier, updated_at
            FROM cw_contacts
            ORDER BY updated_at DESC NULLS LAST
            LIMIT $1
          `,
          [limit]
        );

    return { ok: true, contacts: rows, request_id: request.requestId };
  });

  app.get("/conversations", async (request) => {
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
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT $1
      `,
      [limit]
    );
    return { ok: true, conversations: rows, request_id: request.requestId };
  });

  app.get("/messages", async (request) => {
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
            WHERE conversation_global_id = $1
            ORDER BY created_at DESC NULLS LAST
            LIMIT $2
          `,
          [conversationGlobalId, limit]
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
            ORDER BY created_at DESC NULLS LAST
            LIMIT $1
          `,
          [limit]
        );

    return { ok: true, messages: rows, request_id: request.requestId };
  });

  app.post("/jobs/chatwoot/sync", async (request, reply) => {
    const job = await startJob(pool, "chatwoot_sync");
    try {
      const result = await runChatwootSync(pool, request.log);
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
    const job = await startJob(pool, "embeddings_run");
    try {
      const result = await runEmbeddings(pool, request.log);
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

  app.get("/jobs/status", async (request) => {
    const status = await getJobsStatus(pool);
    return { ok: true, ...status, request_id: request.requestId };
  });

  app.post("/search", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const query = String(body?.query || "").trim();
    const topK = toTopK(body?.topK, 10);

    if (!query) {
      return reply.code(400).send({ ok: false, error: "query_required", request_id: request.requestId });
    }

    const result = await searchChunks(pool, query, topK, request.log);
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
