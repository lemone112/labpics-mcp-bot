import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import { createDbPool } from "./lib/db.js";
import { fetchWithRetry } from "./lib/http.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { runChatwootSync } from "./services/chatwoot.js";
import { runEmbeddings, searchChunks } from "./services/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "./services/jobs.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getLocalAuthConfig() {
  const username = process.env.AUTH_USERNAME || process.env.ADMIN_USERNAME;
  const password = process.env.AUTH_PASSWORD || process.env.ADMIN_PASSWORD;

  if (!username && !password) {
    return null;
  }
  if (!username || !password) {
    throw new Error("Incomplete local auth config. Set both AUTH_USERNAME and AUTH_PASSWORD.");
  }

  return { username, password };
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getGoogleAuthConfig() {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUrl = (process.env.GOOGLE_OAUTH_REDIRECT_URL || "").trim();

  const providedCount = [clientId, clientSecret, redirectUrl].filter(Boolean).length;
  if (providedCount === 0) return null;
  if (providedCount < 3) {
    throw new Error(
      "Incomplete Google OAuth config. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URL."
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUrl,
    allowedDomains: new Set(parseList(process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS)),
    allowedEmails: new Set(parseList(process.env.GOOGLE_OAUTH_ALLOWED_EMAILS)),
  };
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function sanitizeNextPath(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/projects";
  }
  return raw;
}

function readResponseJsonSafe(response, fallback = {}) {
  return response
    .json()
    .catch(() => fallback);
}

async function exchangeGoogleCodeForProfile(code, googleAuth, logger) {
  const tokenBody = new URLSearchParams({
    code,
    client_id: googleAuth.clientId,
    client_secret: googleAuth.clientSecret,
    redirect_uri: googleAuth.redirectUrl,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
    timeoutMs: 15_000,
    retries: 1,
    logger,
  });
  if (!tokenResponse.ok) {
    const payload = await readResponseJsonSafe(tokenResponse);
    throw new Error(`google_token_exchange_failed:${tokenResponse.status}:${String(payload?.error || "unknown")}`);
  }

  const tokenData = await readResponseJsonSafe(tokenResponse);
  const idToken = String(tokenData?.id_token || "");
  if (!idToken) {
    throw new Error("google_id_token_missing");
  }

  const tokenInfoResponse = await fetchWithRetry(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    {
      method: "GET",
      timeoutMs: 15_000,
      retries: 1,
      logger,
    }
  );
  if (!tokenInfoResponse.ok) {
    const payload = await readResponseJsonSafe(tokenInfoResponse);
    throw new Error(`google_token_info_failed:${tokenInfoResponse.status}:${String(payload?.error || "unknown")}`);
  }

  const tokenInfo = await readResponseJsonSafe(tokenInfoResponse);
  const aud = String(tokenInfo?.aud || "");
  if (aud !== googleAuth.clientId) {
    throw new Error("google_invalid_audience");
  }

  const exp = Number.parseInt(String(tokenInfo?.exp || "0"), 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() - 30_000) {
    throw new Error("google_token_expired");
  }

  const email = String(tokenInfo?.email || "").trim().toLowerCase();
  const sub = String(tokenInfo?.sub || "").trim();
  const emailVerified = String(tokenInfo?.email_verified || "") === "true";
  if (!sub || !email || !emailVerified) {
    throw new Error("google_profile_invalid");
  }

  const domain = email.split("@")[1] || "";
  if (googleAuth.allowedDomains.size > 0 && !googleAuth.allowedDomains.has(domain)) {
    throw new Error("google_domain_not_allowed");
  }
  if (googleAuth.allowedEmails.size > 0 && !googleAuth.allowedEmails.has(email)) {
    throw new Error("google_email_not_allowed");
  }

  return {
    sub,
    email,
    username: email,
  };
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
  const localAuth = getLocalAuthConfig();
  const googleAuth = getGoogleAuthConfig();
  if (!localAuth && !googleAuth) {
    throw new Error("No auth providers configured. Set local auth or Google OAuth env vars.");
  }
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
  const oauthCookieOptions = {
    ...cookieOptions,
    maxAge: 60 * 10,
  };
  const oauthStateCookieName = `${cookieName}_oauth_state`;
  const oauthNextCookieName = `${cookieName}_oauth_next`;

  app.log.info(
    {
      local_auth_enabled: Boolean(localAuth),
      google_auth_enabled: Boolean(googleAuth),
    },
    "auth providers configured"
  );

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

  app.get("/auth/providers", async (request) => {
    return {
      ok: true,
      providers: {
        password: Boolean(localAuth),
        google: Boolean(googleAuth),
      },
      request_id: request.requestId,
    };
  });

  app.post("/auth/login", async (request, reply) => {
    if (!localAuth) {
      return reply.code(400).send({ ok: false, error: "local_auth_disabled", request_id: request.requestId });
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    if (!timingSafeStringEqual(username, localAuth.username) || !timingSafeStringEqual(password, localAuth.password)) {
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

  app.get("/auth/google/start", async (request, reply) => {
    if (!googleAuth) {
      return reply.code(404).send({ ok: false, error: "google_auth_disabled", request_id: request.requestId });
    }

    const nextPath = sanitizeNextPath(request.query?.next || "/projects");
    const state = crypto.randomBytes(24).toString("hex");
    const params = new URLSearchParams({
      client_id: googleAuth.clientId,
      redirect_uri: googleAuth.redirectUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
      access_type: "online",
      include_granted_scopes: "true",
    });

    reply.setCookie(oauthStateCookieName, state, oauthCookieOptions);
    reply.setCookie(oauthNextCookieName, nextPath, oauthCookieOptions);
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/auth/google/callback", async (request, reply) => {
    const failure = (code) => reply.redirect(`/login?error=${encodeURIComponent(code)}`);

    if (!googleAuth) {
      return failure("google_auth_disabled");
    }

    const code = String(request.query?.code || "").trim();
    const state = String(request.query?.state || "").trim();
    const expectedState = String(request.cookies?.[oauthStateCookieName] || "");
    const nextPath = sanitizeNextPath(request.cookies?.[oauthNextCookieName] || "/projects");

    reply.clearCookie(oauthStateCookieName, oauthCookieOptions);
    reply.clearCookie(oauthNextCookieName, oauthCookieOptions);

    if (!code || !state || !expectedState || !timingSafeStringEqual(state, expectedState)) {
      request.log.warn({ request_id: request.requestId }, "invalid google oauth state");
      return failure("google_state_invalid");
    }

    try {
      const profile = await exchangeGoogleCodeForProfile(code, googleAuth, request.log);
      const sid = crypto.randomBytes(32).toString("hex");
      await pool.query(
        `
          INSERT INTO sessions(session_id, username, active_project_id, created_at, last_seen_at)
          VALUES($1, $2, NULL, now(), now())
        `,
        [sid, profile.username]
      );

      reply.setCookie(cookieName, sid, cookieOptions);
      return reply.redirect(nextPath);
    } catch (error) {
      request.log.warn(
        {
          err: String(error?.message || error),
          request_id: request.requestId,
        },
        "google auth callback failed"
      );
      return failure("google_auth_failed");
    }
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
