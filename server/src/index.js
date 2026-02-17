import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import { createDbPool } from "./lib/db.js";
import { ApiError, fail, parseLimit, sendError, sendOk, toApiError } from "./lib/api-contract.js";
import { requireProjectScope } from "./lib/scope.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { runChatwootSync } from "./services/chatwoot.js";
import { runEmbeddings, searchChunks } from "./services/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "./services/jobs.js";
import { listAuditEvents, normalizeEvidenceRefs, writeAuditEvent } from "./services/audit.js";
import { approveOutbound, createOutboundDraft, listOutbound, processDueOutbounds, sendOutbound, setOptOut } from "./services/outbox.js";
import { listScheduledJobs, runSchedulerTick } from "./services/scheduler.js";
import { runAttioSync } from "./services/attio.js";
import { runLinearSync } from "./services/linear.js";
import { applyIdentitySuggestions, listIdentityLinks, listIdentitySuggestions, previewIdentitySuggestions } from "./services/identity-graph.js";
import { extractSignalsAndNba, getTopNba, listNba, listSignals, updateNbaStatus, updateSignalStatus } from "./services/signals.js";
import { listUpsellRadar, refreshUpsellRadar, updateUpsellStatus } from "./services/upsell.js";
import { applyContinuityActions, buildContinuityPreview, listContinuityActions } from "./services/continuity.js";
import { getPortfolioOverview } from "./services/portfolio.js";
import { syncLoopsContacts } from "./services/loops.js";
import {
  generateDailyDigest,
  generateWeeklyDigest,
  getAnalyticsOverview,
  getControlTower,
  getDigests,
  getRiskOverview,
  refreshAnalytics,
  refreshRiskAndHealth,
} from "./services/intelligence.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getAuthConfig() {
  const packed = String(process.env.AUTH_CREDENTIALS || "").trim();
  if (packed) {
    const idx = packed.indexOf(":");
    const username = idx >= 0 ? packed.slice(0, idx).trim() : "";
    const password = idx >= 0 ? packed.slice(idx + 1) : "";
    if (!username || !password) {
      throw new Error("Invalid AUTH_CREDENTIALS format. Expected \"login:password\".");
    }
    return { username, password };
  }

  const username = String(process.env.AUTH_USERNAME || process.env.ADMIN_USERNAME || "").trim();
  const password = String(process.env.AUTH_PASSWORD || process.env.ADMIN_PASSWORD || "");
  if (!username || !password) {
    throw new Error("Missing auth credentials. Set AUTH_CREDENTIALS in format \"login:password\".");
  }
  return { username, password };
}

function toTopK(value, fallback = 10) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 50));
}

function toNumber(value, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeAccountUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function parseProjectIdsInput(value, max = 50) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const deduped = [];
  const seen = new Set();
  for (const item of rawValues) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    deduped.push(normalized);
    seen.add(normalized);
    if (deduped.length >= max) break;
  }
  return deduped;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const auth = getAuthConfig();
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "0.0.0.0";
  const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
  const csrfCookieName = process.env.CSRF_COOKIE_NAME || "csrf_token";
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
  const loginRateLimitMaxAttempts = toBoundedInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 10, 3, 100);
  const loginRateLimitWindowMinutes = toBoundedInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15, 1, 1440);

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
  const csrfCookieOptions = {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 14,
  };

  const loginAttempts = new Map();
  const loginWindowMs = loginRateLimitWindowMinutes * 60 * 1000;
  const metrics = {
    requests_total: 0,
    responses_total: 0,
    errors_total: 0,
    status_counts: {},
  };

  function loginAttemptKey(ip, username) {
    return `${String(ip || "unknown")}:${normalizeAccountUsername(username || "") || "-"}`;
  }

  function cleanupLoginAttempt(key) {
    const state = loginAttempts.get(key);
    if (!state) return;
    if (Date.now() - state.startedAt > loginWindowMs) {
      loginAttempts.delete(key);
    }
  }

  function assertLoginRateLimit(ip, username) {
    const key = loginAttemptKey(ip, username);
    cleanupLoginAttempt(key);
    const state = loginAttempts.get(key);
    if (!state) return;
    if (state.count >= loginRateLimitMaxAttempts) {
      fail(429, "login_rate_limited", "Too many login attempts, try again later");
    }
  }

  function recordLoginFailure(ip, username) {
    const key = loginAttemptKey(ip, username);
    cleanupLoginAttempt(key);
    const state = loginAttempts.get(key);
    if (!state) {
      loginAttempts.set(key, { count: 1, startedAt: Date.now() });
      return;
    }
    state.count += 1;
    loginAttempts.set(key, state);
  }

  function clearLoginFailures(ip, username) {
    loginAttempts.delete(loginAttemptKey(ip, username));
  }

  async function createSession(username) {
    const sid = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    await pool.query(
      `
        INSERT INTO sessions(session_id, username, active_project_id, csrf_token, created_at, last_seen_at)
        VALUES($1, $2, NULL, $3, now(), now())
      `,
      [sid, username, csrfToken]
    );
    return { sid, csrfToken };
  }

  function routePathForAuthCheck(pathName) {
    if (pathName === "/v1") return "/";
    if (pathName.startsWith("/v1/")) return pathName.slice(3);
    return pathName;
  }

  function registerGet(pathName, handler) {
    app.get(pathName, handler);
    app.get(`/v1${pathName}`, handler);
  }

  function registerPost(pathName, handler) {
    app.post(pathName, handler);
    app.post(`/v1${pathName}`, handler);
  }

  app.addHook("onRequest", async (request, reply) => {
    metrics.requests_total += 1;
    const requestId = String(request.headers["x-request-id"] || request.id);
    request.requestId = requestId;
    reply.header("x-request-id", requestId);

    const rawPath = request.url.split("?")[0];
    const pathName = routePathForAuthCheck(rawPath);
    const isPublic = pathName === "/health" || pathName === "/metrics" || pathName.startsWith("/auth/");
    if (isPublic) return;

    const sid = request.cookies?.[cookieName];
    if (!sid) {
      return sendError(reply, requestId, new ApiError(401, "unauthorized", "Unauthorized"));
    }

    const { rows } = await pool.query(
      `
        SELECT
          s.session_id,
          s.username,
          s.active_project_id,
          s.csrf_token,
          p.account_scope_id
        FROM sessions AS s
        LEFT JOIN projects AS p ON p.id = s.active_project_id
        WHERE s.session_id = $1
        LIMIT 1
      `,
      [sid]
    );
    if (!rows[0]) {
      reply.clearCookie(cookieName, cookieOptions);
      reply.clearCookie(csrfCookieName, csrfCookieOptions);
      return sendError(reply, requestId, new ApiError(401, "unauthorized", "Unauthorized"));
    }

    request.auth = rows[0];
    await pool.query("UPDATE sessions SET last_seen_at = now() WHERE session_id = $1", [sid]);

    const isMutating = !["GET", "HEAD", "OPTIONS"].includes(String(request.method || "GET").toUpperCase());
    if (isMutating) {
      const csrfHeader = String(request.headers["x-csrf-token"] || "");
      if (!csrfHeader || !timingSafeStringEqual(csrfHeader, request.auth.csrf_token)) {
        return sendError(reply, requestId, new ApiError(403, "csrf_invalid", "Invalid CSRF token"));
      }
    }
  });

  app.addHook("onResponse", async (_request, reply) => {
    metrics.responses_total += 1;
    const code = Number(reply.statusCode || 0);
    const key = Number.isFinite(code) ? String(code) : "0";
    metrics.status_counts[key] = (metrics.status_counts[key] || 0) + 1;
  });

  registerGet("/health", async (request, reply) => {
    return sendOk(reply, request.requestId, { service: "server" });
  });

  registerGet("/metrics", async (_request, reply) => {
    const lines = [
      "# TYPE app_requests_total counter",
      `app_requests_total ${metrics.requests_total}`,
      "# TYPE app_responses_total counter",
      `app_responses_total ${metrics.responses_total}`,
      "# TYPE app_errors_total counter",
      `app_errors_total ${metrics.errors_total}`,
    ];
    for (const [statusCode, count] of Object.entries(metrics.status_counts)) {
      lines.push(`app_response_status_total{status="${statusCode}"} ${count}`);
    }
    reply.type("text/plain; version=0.0.4");
    return lines.join("\n");
  });

  registerPost("/auth/login", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const username = normalizeAccountUsername(body?.username);
    const password = String(body?.password || "");
    if (!username || !password) {
      return sendError(reply, request.requestId, new ApiError(400, "missing_credentials", "Missing credentials"));
    }

    assertLoginRateLimit(request.ip, username);

    const authUsername = normalizeAccountUsername(auth.username);
    const sessionUsername =
      timingSafeStringEqual(username, authUsername) && timingSafeStringEqual(password, auth.password)
        ? auth.username
        : null;

    if (!sessionUsername) {
      recordLoginFailure(request.ip, username);
      return sendError(reply, request.requestId, new ApiError(401, "invalid_credentials", "Invalid credentials"));
    }

    clearLoginFailures(request.ip, username);
    const { sid, csrfToken } = await createSession(sessionUsername);

    reply.setCookie(cookieName, sid, cookieOptions);
    reply.setCookie(csrfCookieName, csrfToken, csrfCookieOptions);
    return sendOk(reply, request.requestId, {
      username: sessionUsername,
      active_project_id: null,
      csrf_cookie_name: csrfCookieName,
    });
  });

  registerGet("/auth/signup/status", async (request, reply) => {
    return sendOk(reply, request.requestId, {
      enabled: false,
      has_telegram_token: false,
      owner_bound: false,
      reason: "signup_disabled",
    });
  });

  registerPost("/auth/signup/start", async (request, reply) => {
    return sendError(reply, request.requestId, new ApiError(410, "signup_disabled", "Signup is disabled"));
  });

  registerPost("/auth/signup/confirm", async (request, reply) => {
    return sendError(reply, request.requestId, new ApiError(410, "signup_disabled", "Signup is disabled"));
  });

  registerPost("/auth/telegram/webhook", async (request, reply) => {
    return sendError(reply, request.requestId, new ApiError(410, "telegram_disabled", "Telegram flow is disabled"));
  });

  registerPost("/auth/logout", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (sid) await pool.query("DELETE FROM sessions WHERE session_id = $1", [sid]);
    reply.clearCookie(cookieName, cookieOptions);
    reply.clearCookie(csrfCookieName, csrfCookieOptions);
    return sendOk(reply, request.requestId);
  });

  registerGet("/auth/me", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (!sid) return sendOk(reply, request.requestId, { authenticated: false });

    const { rows } = await pool.query(
      `
        SELECT
          s.session_id,
          s.username,
          s.active_project_id,
          s.created_at,
          s.last_seen_at,
          p.account_scope_id
        FROM sessions AS s
        LEFT JOIN projects AS p ON p.id = s.active_project_id
        WHERE s.session_id = $1
        LIMIT 1
      `,
      [sid]
    );
    if (!rows[0]) {
      reply.clearCookie(cookieName, cookieOptions);
      reply.clearCookie(csrfCookieName, csrfCookieOptions);
      return sendOk(reply, request.requestId, { authenticated: false });
    }

    return sendOk(reply, request.requestId, {
      authenticated: true,
      username: rows[0].username,
      active_project_id: rows[0].active_project_id,
      account_scope_id: rows[0].account_scope_id,
      csrf_cookie_name: csrfCookieName,
      created_at: rows[0].created_at,
      last_seen_at: rows[0].last_seen_at,
    });
  });

  registerGet("/projects", async (request, reply) => {
    const { rows } = await pool.query(
      "SELECT id, name, account_scope_id, created_at FROM projects ORDER BY created_at DESC"
    );
    return sendOk(reply, request.requestId, {
      projects: rows,
      active_project_id: request.auth?.active_project_id || null,
      account_scope_id: request.auth?.account_scope_id || null,
    });
  });

  registerPost("/projects", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const name = String(body?.name || "").trim();
    if (name.length < 2 || name.length > 160) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_name", "Invalid project name"));
    }

    const desiredScopeKey = String(body?.account_scope_key || "").trim().toLowerCase() || null;
    const scopeName = String(body?.account_scope_name || "").trim() || "Project account scope";
    let accountScopeId = null;
    if (desiredScopeKey) {
      const { rows: scopeRows } = await pool.query(
        `
          INSERT INTO account_scopes(scope_key, name)
          VALUES ($1, $2)
          ON CONFLICT (scope_key)
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `,
        [desiredScopeKey, scopeName.slice(0, 160)]
      );
      accountScopeId = scopeRows[0]?.id || null;
    } else {
      const { rows: scopeRows } = await pool.query(
        `
          SELECT id
          FROM account_scopes
          WHERE scope_key = 'default'
          LIMIT 1
        `
      );
      accountScopeId = scopeRows[0]?.id || null;
    }
    if (!accountScopeId) {
      fail(500, "account_scope_resolve_failed", "Failed to resolve account scope");
    }

    const { rows } = await pool.query(
      `
        INSERT INTO projects(name, account_scope_id)
        VALUES ($1, $2)
        RETURNING id, name, account_scope_id, created_at
      `,
      [name, accountScopeId]
    );

    await writeAuditEvent(pool, {
      projectId: rows[0].id,
      accountScopeId: rows[0].account_scope_id,
      actorUsername: request.auth?.username || null,
      action: "project.create",
      entityType: "project",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { name: rows[0].name },
      evidenceRefs: [],
    });

    return sendOk(reply, request.requestId, { project: rows[0] });
  });

  registerPost("/projects/:id/select", async (request, reply) => {
    const projectId = String(request.params?.id || "");
    const sid = request.auth?.session_id;
    if (!projectId) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_project_id", "Invalid project ID"));
    }

    const project = await pool.query(
      "SELECT id, name, account_scope_id FROM projects WHERE id = $1 LIMIT 1",
      [projectId]
    );
    if (!project.rows[0]) {
      return sendError(reply, request.requestId, new ApiError(404, "project_not_found", "Project not found"));
    }

    await pool.query("UPDATE sessions SET active_project_id = $2, last_seen_at = now() WHERE session_id = $1", [sid, projectId]);
    await writeAuditEvent(pool, {
      projectId,
      accountScopeId: project.rows[0].account_scope_id,
      actorUsername: request.auth?.username || null,
      action: "project.select",
      entityType: "project",
      entityId: projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { selected_project_id: projectId },
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, {
      active_project_id: projectId,
      project: project.rows[0],
    });
  });

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

  registerPost("/jobs/chatwoot/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "chatwoot_sync", scope);
    try {
      const result = await runChatwootSync(pool, scope, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed_messages,
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.chatwoot_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "chatwoot sync job failed");
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.chatwoot_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("chatwoot_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "chatwoot_source_binding_error", "Chatwoot source binding conflict", { reason: errMsg })
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "chatwoot_sync_failed", "Chatwoot sync failed"));
    }
  });

  registerPost("/jobs/embeddings/run", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "embeddings_run", scope);
    try {
      const result = await runEmbeddings(pool, scope, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: result.processed,
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.embeddings_run",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      request.log.error({ err: errMsg, request_id: request.requestId }, "embeddings job failed");
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.embeddings_run",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      return sendError(reply, request.requestId, new ApiError(500, "embeddings_job_failed", "Embeddings job failed"));
    }
  });

  registerPost("/jobs/attio/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "attio_sync", scope);
    try {
      const result = await runAttioSync(pool, scope, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: Number(result.touched_accounts || 0) + Number(result.touched_opportunities || 0),
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.attio_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.attio_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("attio_workspace_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "attio_source_binding_error", "Attio source binding conflict", { reason: errMsg })
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "attio_sync_failed", "Attio sync failed"));
    }
  });

  registerPost("/jobs/linear/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const job = await startJob(pool, "linear_sync", scope);
    try {
      const result = await runLinearSync(pool, scope, request.log);
      await finishJob(pool, job.id, {
        status: "ok",
        processedCount: Number(result.touched_projects || 0) + Number(result.touched_issues || 0),
        meta: result,
      });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.linear_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const errMsg = String(error?.message || error);
      await finishJob(pool, job.id, { status: "failed", error: errMsg });
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "job.linear_sync",
        entityType: "job_run",
        entityId: String(job.id),
        status: "failed",
        requestId: request.requestId,
        payload: { error: errMsg },
        evidenceRefs: [],
      });
      if (errMsg.includes("linear_workspace_source_")) {
        return sendError(
          reply,
          request.requestId,
          new ApiError(409, "linear_source_binding_error", "Linear source binding conflict", { reason: errMsg })
        );
      }
      return sendError(reply, request.requestId, new ApiError(500, "linear_sync_failed", "Linear sync failed"));
    }
  });

  registerGet("/jobs/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const status = await getJobsStatus(pool, scope);
    return sendOk(reply, request.requestId, status);
  });

  registerGet("/jobs/scheduler", async (request, reply) => {
    const scope = requireProjectScope(request);
    const jobs = await listScheduledJobs(pool, scope);
    return sendOk(reply, request.requestId, { jobs });
  });

  registerPost("/jobs/scheduler/tick", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 10, 100);
    const result = await runSchedulerTick(pool, scope, { limit, logger: request.log });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "job.scheduler_tick",
      entityType: "scheduler",
      entityId: scope.projectId,
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const query = String(body?.query || "").trim();
    const topK = toTopK(body?.topK, 10);

    if (!query) {
      return sendError(reply, request.requestId, new ApiError(400, "query_required", "Query is required"));
    }

    const result = await searchChunks(pool, scope, query, topK, request.log);
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/control-tower", async (request, reply) => {
    const scope = requireProjectScope(request);
    const payload = await getControlTower(pool, scope);
    return sendOk(reply, request.requestId, payload);
  });

  registerGet("/portfolio/overview", async (request, reply) => {
    const accountScopeId = request.auth?.account_scope_id || null;
    if (!accountScopeId) {
      fail(409, "account_scope_required", "Account scope is required");
    }

    const payload = await getPortfolioOverview(pool, {
      accountScopeId,
      activeProjectId: request.auth?.active_project_id || null,
      projectIds: parseProjectIdsInput(request.query?.project_ids, 100),
      messageLimit: request.query?.message_limit,
      cardLimit: request.query?.card_limit,
    });
    return sendOk(reply, request.requestId, payload);
  });

  registerPost("/identity/suggestions/preview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const limit = parseLimit(body?.limit, 100, 200);
    const result = await previewIdentitySuggestions(pool, scope, limit);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "identity.preview",
      entityType: "identity_link_suggestion",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { generated: result.generated, stored: result.stored },
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/identity/suggestions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listIdentitySuggestions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { suggestions: rows });
  });

  registerPost("/identity/suggestions/apply", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const suggestionIds = Array.isArray(body?.suggestion_ids) ? body.suggestion_ids : [];
    const result = await applyIdentitySuggestions(pool, scope, suggestionIds, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "identity.apply",
      entityType: "identity_link",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { applied: result.applied },
      evidenceRefs: result.links.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/identity/links", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listIdentityLinks(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { links: rows });
  });

  registerPost("/signals/extract", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await extractSignalsAndNba(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "signals.extract",
      entityType: "signal",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/signals", async (request, reply) => {
    const scope = requireProjectScope(request);
    const signals = await listSignals(pool, scope, {
      status: request.query?.status,
      severity_min: request.query?.severity_min,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { signals });
  });

  registerPost("/signals/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const signal = await updateSignalStatus(
      pool,
      scope,
      String(request.params?.id || ""),
      String(body?.status || "")
    );
    if (!signal) {
      return sendError(reply, request.requestId, new ApiError(404, "signal_not_found", "Signal not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "signals.status_update",
      entityType: "signal",
      entityId: signal.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: signal.status },
      evidenceRefs: signal.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { signal });
  });

  registerGet("/nba", async (request, reply) => {
    const scope = requireProjectScope(request);
    const items = await listNba(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { items });
  });

  registerPost("/nba/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const item = await updateNbaStatus(pool, scope, String(request.params?.id || ""), String(body?.status || ""));
    if (!item) {
      return sendError(reply, request.requestId, new ApiError(404, "nba_not_found", "NBA item not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "nba.status_update",
      entityType: "next_best_action",
      entityId: item.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { item });
  });

  registerPost("/upsell/radar/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshUpsellRadar(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "upsell.refresh",
      entityType: "upsell_opportunity",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/upsell/radar", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listUpsellRadar(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { opportunities: rows });
  });

  registerPost("/upsell/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const item = await updateUpsellStatus(pool, scope, String(request.params?.id || ""), String(body?.status || ""));
    if (!item) {
      return sendError(reply, request.requestId, new ApiError(404, "upsell_not_found", "Upsell opportunity not found"));
    }
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "upsell.status_update",
      entityType: "upsell_opportunity",
      entityId: item.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: item.status },
      evidenceRefs: item.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { item });
  });

  registerPost("/continuity/preview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await buildContinuityPreview(pool, scope, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "continuity.preview",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { touched: result.touched },
      evidenceRefs: result.rows.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/continuity/actions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const actions = await listContinuityActions(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { actions });
  });

  registerPost("/continuity/apply", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const ids = Array.isArray(body?.action_ids) ? body.action_ids : [];
    const result = await applyContinuityActions(pool, scope, ids, request.auth?.username || null);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "continuity.apply",
      entityType: "continuity_action",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { applied: result.applied },
      evidenceRefs: result.actions.flatMap((row) => row.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/crm/accounts", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 200, 500);
    const rows = await pool.query(
      `
        SELECT id, name, domain, external_ref, stage, owner_username, created_at, updated_at
        FROM crm_accounts
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, limit]
    );
    return sendOk(reply, request.requestId, { accounts: rows.rows });
  });

  registerPost("/crm/accounts", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const name = String(body?.name || "").trim();
    if (name.length < 2) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_account_name", "Account name is required"));
    }
    const domain = String(body?.domain || "").trim() || null;
    const stage = String(body?.stage || "prospect").trim().toLowerCase();
    const ownerUsername = String(body?.owner_username || request.auth?.username || "").trim() || null;
    const { rows } = await pool.query(
      `
        INSERT INTO crm_accounts(project_id, account_scope_id, name, domain, external_ref, stage, owner_username, updated_at)
        VALUES ($1, $2, $3, $4, NULL, $5, $6, now())
        RETURNING id, name, domain, external_ref, stage, owner_username, created_at, updated_at
      `,
      [scope.projectId, scope.accountScopeId, name.slice(0, 300), domain, stage, ownerUsername]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.account.create",
      entityType: "crm_account",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { name: rows[0].name, stage: rows[0].stage },
      evidenceRefs: normalizeEvidenceRefs(body?.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, { account: rows[0] }, 201);
  });

  registerGet("/crm/opportunities", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 200, 500);
    const status = String(request.query?.stage || "").trim().toLowerCase();
    const rows = await pool.query(
      `
        SELECT
          o.id,
          o.account_id,
          a.name AS account_name,
          o.title,
          o.stage,
          o.amount_estimate,
          o.probability,
          o.expected_close_date,
          o.next_step,
          o.owner_username,
          o.evidence_refs,
          o.created_at,
          o.updated_at
        FROM crm_opportunities AS o
        LEFT JOIN crm_accounts AS a ON a.id = o.account_id
        WHERE o.project_id = $1
          AND o.account_scope_id = $2
          AND ($3 = '' OR o.stage = $3)
        ORDER BY o.updated_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, status, limit]
    );
    return sendOk(reply, request.requestId, { opportunities: rows.rows });
  });

  registerPost("/crm/opportunities", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const title = String(body?.title || "").trim();
    const accountId = String(body?.account_id || "").trim();
    const nextStep = String(body?.next_step || "").trim();
    if (!title) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_opportunity_title", "Opportunity title is required"));
    }
    if (!accountId) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_account_id", "account_id is required"));
    }
    if (!nextStep || nextStep.length < 4) {
      return sendError(reply, request.requestId, new ApiError(400, "next_step_required", "next_step is required"));
    }
    const stage = String(body?.stage || "discovery").trim().toLowerCase();
    const probability = toNumber(body?.probability, 0.1, 0, 1);
    const amount = toNumber(body?.amount_estimate, 0, 0, 1_000_000_000);
    const { rows } = await pool.query(
      `
        INSERT INTO crm_opportunities(
          project_id,
          account_scope_id,
          account_id,
          title,
          stage,
          amount_estimate,
          probability,
          expected_close_date,
          next_step,
          owner_username,
          evidence_refs,
          updated_at
        )
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
        RETURNING id, account_id, title, stage, amount_estimate, probability, expected_close_date, next_step, owner_username, evidence_refs, created_at, updated_at
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        accountId,
        title.slice(0, 500),
        stage,
        amount,
        probability,
        body?.expected_close_date || null,
        nextStep.slice(0, 1000),
        String(body?.owner_username || request.auth?.username || "").trim() || null,
        JSON.stringify(normalizeEvidenceRefs(body?.evidence_refs || [])),
      ]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.opportunity.create",
      entityType: "crm_opportunity",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: {
        title: rows[0].title,
        stage: rows[0].stage,
        amount_estimate: rows[0].amount_estimate,
        probability: rows[0].probability,
      },
      evidenceRefs: rows[0].evidence_refs || [],
    });
    return sendOk(reply, request.requestId, { opportunity: rows[0] }, 201);
  });

  registerPost("/crm/opportunities/:id/stage", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const nextStage = String(body?.stage || "").trim().toLowerCase();
    const reason = String(body?.reason || "").trim() || null;
    const evidenceRefs = normalizeEvidenceRefs(body?.evidence_refs || []);
    if (!nextStage) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_stage", "stage is required"));
    }
    const current = await pool.query(
      `
        SELECT id, stage, title
        FROM crm_opportunities
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        LIMIT 1
      `,
      [String(request.params?.id || ""), scope.projectId, scope.accountScopeId]
    );
    if (!current.rows[0]) {
      return sendError(reply, request.requestId, new ApiError(404, "opportunity_not_found", "Opportunity not found"));
    }
    const updated = await pool.query(
      `
        UPDATE crm_opportunities
        SET stage = $4,
            updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        RETURNING id, title, stage, amount_estimate, probability, expected_close_date, next_step, updated_at, evidence_refs
      `,
      [current.rows[0].id, scope.projectId, scope.accountScopeId, nextStage]
    );
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "crm.opportunity.stage_update",
      entityType: "crm_opportunity",
      entityId: current.rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: { from_stage: current.rows[0].stage, to_stage: nextStage, reason },
      evidenceRefs,
    });
    await pool.query(
      `
        INSERT INTO crm_opportunity_stage_events(
          project_id,
          account_scope_id,
          opportunity_id,
          from_stage,
          to_stage,
          reason,
          actor_username,
          evidence_refs,
          audit_event_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        current.rows[0].id,
        current.rows[0].stage,
        nextStage,
        reason,
        request.auth?.username || null,
        JSON.stringify(evidenceRefs),
        audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { opportunity: updated.rows[0] });
  });

  registerGet("/crm/overview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const [accounts, opportunities, links] = await Promise.all([
      pool.query(
        `
          SELECT count(*)::int AS total_accounts
          FROM crm_accounts
          WHERE project_id = $1
            AND account_scope_id = $2
        `,
        [scope.projectId, scope.accountScopeId]
      ),
      pool.query(
        `
          SELECT stage, count(*)::int AS count
          FROM crm_opportunities
          WHERE project_id = $1
            AND account_scope_id = $2
          GROUP BY stage
        `,
        [scope.projectId, scope.accountScopeId]
      ),
      pool.query(
        `
          SELECT status, count(*)::int AS count
          FROM identity_links
          WHERE project_id = $1
            AND account_scope_id = $2
          GROUP BY status
        `,
        [scope.projectId, scope.accountScopeId]
      ),
    ]);
    return sendOk(reply, request.requestId, {
      accounts: accounts.rows[0]?.total_accounts || 0,
      opportunity_by_stage: opportunities.rows,
      links_by_status: links.rows,
    });
  });

  registerGet("/offers", async (request, reply) => {
    const scope = requireProjectScope(request);
    const limit = parseLimit(request.query?.limit, 150, 500);
    const rows = await pool.query(
      `
        SELECT
          id,
          account_id,
          opportunity_id,
          title,
          currency,
          subtotal,
          discount_pct,
          total,
          status,
          generated_doc_url,
          evidence_refs,
          created_by,
          created_at,
          updated_at
        FROM offers
        WHERE project_id = $1
          AND account_scope_id = $2
        ORDER BY updated_at DESC
        LIMIT $3
      `,
      [scope.projectId, scope.accountScopeId, limit]
    );
    return sendOk(reply, request.requestId, { offers: rows.rows });
  });

  registerPost("/offers", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const title = String(body?.title || "").trim();
    if (!title) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_offer_title", "Offer title is required"));
    }
    const subtotal = toNumber(body?.subtotal, 0, 0, 1_000_000_000);
    const discountPct = toNumber(body?.discount_pct, 0, 0, 100);
    const total = Number((subtotal * (1 - discountPct / 100)).toFixed(2));
    const status = discountPct > 0 ? "draft" : "approved";
    const evidenceRefs = normalizeEvidenceRefs(body?.evidence_refs || []);
    const { rows } = await pool.query(
      `
        INSERT INTO offers(
          project_id,
          account_scope_id,
          account_id,
          opportunity_id,
          title,
          currency,
          subtotal,
          discount_pct,
          total,
          status,
          generated_doc_url,
          evidence_refs,
          created_by,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11::jsonb, $12, now())
        RETURNING
          id,
          account_id,
          opportunity_id,
          title,
          currency,
          subtotal,
          discount_pct,
          total,
          status,
          generated_doc_url,
          evidence_refs,
          created_by,
          created_at,
          updated_at
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        body?.account_id || null,
        body?.opportunity_id || null,
        title.slice(0, 500),
        String(body?.currency || "USD").trim().toUpperCase().slice(0, 6),
        subtotal,
        discountPct,
        total,
        status,
        JSON.stringify(evidenceRefs),
        request.auth?.username || null,
      ]
    );
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.create",
      entityType: "offer",
      entityId: rows[0].id,
      status: "ok",
      requestId: request.requestId,
      payload: {
        subtotal,
        discount_pct: discountPct,
        total,
        status,
      },
      evidenceRefs,
    });
    return sendOk(reply, request.requestId, { offer: rows[0] }, 201);
  });

  registerPost("/offers/:id/approve-discount", async (request, reply) => {
    const scope = requireProjectScope(request);
    const offerId = String(request.params?.id || "");
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const evidenceRefs = normalizeEvidenceRefs(body?.evidence_refs || []);
    const { rows } = await pool.query(
      `
        UPDATE offers
        SET status = 'approved',
            updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
        RETURNING id, title, discount_pct, status, evidence_refs
      `,
      [offerId, scope.projectId, scope.accountScopeId]
    );
    const offer = rows[0];
    if (!offer) {
      return sendError(reply, request.requestId, new ApiError(404, "offer_not_found", "Offer not found"));
    }
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.approve_discount",
      entityType: "offer",
      entityId: offer.id,
      status: "ok",
      requestId: request.requestId,
      payload: { discount_pct: offer.discount_pct },
      evidenceRefs: evidenceRefs.length ? evidenceRefs : offer.evidence_refs || [],
    });
    await pool.query(
      `
        INSERT INTO offer_approvals(
          project_id,
          account_scope_id,
          offer_id,
          action,
          actor_username,
          comment,
          evidence_refs,
          audit_event_id
        )
        VALUES ($1, $2, $3, 'approve_discount', $4, $5, $6::jsonb, $7)
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        offer.id,
        request.auth?.username || null,
        String(body?.comment || "").trim() || null,
        JSON.stringify(evidenceRefs),
        audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { offer });
  });

  registerPost("/offers/:id/approve-send", async (request, reply) => {
    const scope = requireProjectScope(request);
    const offerId = String(request.params?.id || "");
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const evidenceRefs = normalizeEvidenceRefs(body?.evidence_refs || []);
    const { rows } = await pool.query(
      `
        UPDATE offers
        SET status = 'sent',
            updated_at = now()
        WHERE id = $1
          AND project_id = $2
          AND account_scope_id = $3
          AND status IN ('approved', 'draft')
        RETURNING id, title, status, evidence_refs
      `,
      [offerId, scope.projectId, scope.accountScopeId]
    );
    const offer = rows[0];
    if (!offer) {
      return sendError(reply, request.requestId, new ApiError(404, "offer_not_found", "Offer not found"));
    }
    const audit = await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "offer.approve_send",
      entityType: "offer",
      entityId: offer.id,
      status: "ok",
      requestId: request.requestId,
      payload: { status: "sent" },
      evidenceRefs: evidenceRefs.length ? evidenceRefs : offer.evidence_refs || [],
    });
    await pool.query(
      `
        INSERT INTO offer_approvals(
          project_id,
          account_scope_id,
          offer_id,
          action,
          actor_username,
          comment,
          evidence_refs,
          audit_event_id
        )
        VALUES ($1, $2, $3, 'approve_send', $4, $5, $6::jsonb, $7)
      `,
      [
        scope.projectId,
        scope.accountScopeId,
        offer.id,
        request.auth?.username || null,
        String(body?.comment || "").trim() || null,
        JSON.stringify(evidenceRefs),
        audit.id,
      ]
    );
    return sendOk(reply, request.requestId, { offer });
  });

  registerPost("/digests/daily/generate", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await generateDailyDigest(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "digest.daily.generate",
      entityType: "daily_digest",
      entityId: result.digest_date,
      status: "ok",
      requestId: request.requestId,
      payload: { digest_date: result.digest_date },
      evidenceRefs: result.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/digests/daily", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await getDigests(pool, scope, "daily", parseLimit(request.query?.limit, 20, 100));
    return sendOk(reply, request.requestId, { digests: rows });
  });

  registerPost("/digests/weekly/generate", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await generateWeeklyDigest(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "digest.weekly.generate",
      entityType: "weekly_digest",
      entityId: result.week_start,
      status: "ok",
      requestId: request.requestId,
      payload: { week_start: result.week_start },
      evidenceRefs: result.evidence_refs || [],
    });
    return sendOk(reply, request.requestId, result);
  });

  registerGet("/digests/weekly", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await getDigests(pool, scope, "weekly", parseLimit(request.query?.limit, 12, 52));
    return sendOk(reply, request.requestId, { digests: rows });
  });

  registerPost("/risk/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshRiskAndHealth(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "risk.refresh",
      entityType: "risk_pattern",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/risk/overview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const overview = await getRiskOverview(pool, scope);
    return sendOk(reply, request.requestId, overview);
  });

  registerPost("/analytics/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const days = parseLimit(body?.period_days, 30, 120);
    const result = await refreshAnalytics(pool, scope, days);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "analytics.refresh",
      entityType: "analytics_snapshot",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/analytics/overview", async (request, reply) => {
    const scope = requireProjectScope(request);
    const overview = await getAnalyticsOverview(pool, scope);
    return sendOk(reply, request.requestId, overview);
  });

  registerGet("/analytics/drilldown", async (request, reply) => {
    const scope = requireProjectScope(request);
    const source = String(request.query?.source || "").trim().toLowerCase();
    const limit = parseLimit(request.query?.limit, 50, 200);
    const { rows } = await pool.query(
      `
        SELECT id, source_type, source_table, source_pk, snippet, payload, created_at
        FROM evidence_items
        WHERE project_id = $1
          AND account_scope_id = $2
          AND ($3 = '' OR source_type = $3 OR source_table = $3)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, source || "", limit]
    );
    return sendOk(reply, request.requestId, { evidence: rows });
  });

  registerGet("/audit", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listAuditEvents(pool, scope, {
      action: request.query?.action,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, request.requestId, { events: rows });
  });

  registerGet("/evidence/search", async (request, reply) => {
    const scope = requireProjectScope(request);
    const q = String(request.query?.q || "").trim();
    const limit = parseLimit(request.query?.limit, 30, 200);
    if (!q) return sendOk(reply, request.requestId, { evidence: [] });
    const { rows } = await pool.query(
      `
        SELECT
          id,
          source_type,
          source_table,
          source_pk,
          conversation_global_id,
          message_global_id,
          contact_global_id,
          snippet,
          payload,
          created_at
        FROM evidence_items
        WHERE project_id = $1
          AND account_scope_id = $2
          AND search_text @@ plainto_tsquery('simple', $3)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [scope.projectId, scope.accountScopeId, q, limit]
    );
    return sendOk(reply, request.requestId, { evidence: rows });
  });

  registerGet("/outbound", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listOutbound(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
      offset: request.query?.offset,
    });
    return sendOk(reply, request.requestId, { outbound: rows });
  });

  registerPost("/outbound/draft", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const outbound = await createOutboundDraft(pool, scope, body, request.auth?.username || null, request.requestId);
    return sendOk(reply, request.requestId, { outbound }, 201);
  });

  registerPost("/outbound/:id/approve", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const outbound = await approveOutbound(
      pool,
      scope,
      String(request.params?.id || ""),
      request.auth?.username || null,
      request.requestId,
      body?.evidence_refs || []
    );
    return sendOk(reply, request.requestId, { outbound });
  });

  registerPost("/outbound/:id/send", async (request, reply) => {
    const scope = requireProjectScope(request);
    const outbound = await sendOutbound(
      pool,
      scope,
      String(request.params?.id || ""),
      request.auth?.username || null,
      request.requestId
    );
    return sendOk(reply, request.requestId, { outbound });
  });

  registerPost("/outbound/opt-out", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const policy = await setOptOut(pool, scope, body, request.auth?.username || null, request.requestId);
    return sendOk(reply, request.requestId, { policy });
  });

  registerPost("/outbound/process", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const result = await processDueOutbounds(
      pool,
      scope,
      request.auth?.username || "manual_runner",
      request.requestId,
      parseLimit(body?.limit, 20, 200)
    );
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/loops/sync", async (request, reply) => {
    const accountScopeId = request.auth?.account_scope_id || null;
    if (!accountScopeId) {
      fail(409, "account_scope_required", "Account scope is required");
    }
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const result = await syncLoopsContacts(
      pool,
      {
        accountScopeId,
        projectIds: parseProjectIdsInput(body?.project_ids, 100),
      },
      {
        actorUsername: request.auth?.username || null,
        requestId: request.requestId,
        limit: body?.limit,
      }
    );
    return sendOk(reply, request.requestId, { loops: result });
  });

  app.setErrorHandler((error, request, reply) => {
    const apiError = toApiError(error);
    if (apiError.status >= 500) {
      metrics.errors_total += 1;
      request.log.error({ err: String(error?.message || error), request_id: request.requestId }, "unhandled request error");
    } else {
      request.log.warn(
        { err: String(error?.message || error), status: apiError.status, request_id: request.requestId },
        "request validation/contract error"
      );
    }
    sendError(reply, request.requestId || request.id, apiError);
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
