import "dotenv/config";
import { validateEnv } from "./infra/env-check.js";
validateEnv();

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import bcrypt from "bcrypt";

import { createDbPool } from "./infra/db.js";
import { ApiError, fail, parseBody, sendError, toApiError } from "./infra/api-contract.js";
import {
  LoginSchema,
  CreateProjectSchema,
  CreateAccountSchema,
  CreateOpportunitySchema,
  UpdateStageSchema,
  CreateOfferSchema,
  ApproveOfferSchema,
  CreateOutboundDraftSchema,
  OptOutSchema,
  LightRagQuerySchema,
  LightRagFeedbackSchema,
  SearchSchema,
  SignalStatusSchema,
  NbaStatusSchema,
  IdentityPreviewSchema,
  IdentitySuggestionApplySchema,
  ConnectorRetrySchema,
  AnalyticsRefreshSchema,
  OutboundApproveSchema,
  OutboundProcessSchema,
  LoopsSyncSchema,
  UpsellStatusSchema,
  ContinuityApplySchema,
} from "./infra/schemas.js";
import { rateLimitHook } from "./infra/rate-limit.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { createRedisPubSub } from "./infra/redis-pubsub.js";
import { createSseBroadcaster } from "./infra/sse-broadcaster.js";
import { createCacheLayer } from "./infra/cache.js";
import { requiredEnv } from "./infra/utils.js";
import { createApiKeyAuth } from "./infra/api-keys.js";
import { requireProjectAccess, requireRole, getEffectiveRole, canAccessProject, getAccessibleProjectIds } from "./infra/rbac.js";
import {
  registerHealthRoutes,
  registerAuthRoutes,
  registerProjectRoutes,
  registerDataRoutes,
  registerJobRoutes,
  registerConnectorRoutes,
  registerLightragRoutes,
  registerIntelligenceRoutes,
  registerCrmRoutes,
  registerOfferRoutes,
  registerSignalRoutes,
  registerOutboundRoutes,
  registerApiKeyRoutes,
  registerUserRoutes,
} from "./routes/index.js";

function isBcryptHash(value) {
  return /^\$2[aby]?\$\d{1,2}\$.{53}$/.test(value);
}

function getAuthConfig() {
  const packed = String(process.env.AUTH_CREDENTIALS || "").trim();
  if (packed) {
    const idx = packed.indexOf(":");
    const username = idx >= 0 ? packed.slice(0, idx).trim() : "";
    const password = idx >= 0 ? packed.slice(idx + 1) : "";
    if (!username || !password) {
      throw new Error("Invalid AUTH_CREDENTIALS format. Expected \"login:password\" or \"login:$2b$...\".");
    }
    return { username, password, hashed: isBcryptHash(password) };
  }

  const username = String(process.env.AUTH_USERNAME || process.env.ADMIN_USERNAME || "").trim();
  const password = String(process.env.AUTH_PASSWORD || process.env.ADMIN_PASSWORD || "");
  if (!username || !password) {
    throw new Error("Missing auth credentials. Set AUTH_CREDENTIALS in format \"login:$2b$hash\".");
  }
  return { username, password, hashed: isBcryptHash(password) };
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

function toBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  const maxLen = Math.max(left.length, right.length);
  const paddedLeft = Buffer.alloc(maxLen, 0);
  const paddedRight = Buffer.alloc(maxLen, 0);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  const equal = crypto.timingSafeEqual(paddedLeft, paddedRight);
  return equal && left.length === right.length;
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

function sanitizeRequestId(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.slice(0, 64).replace(/[^a-zA-Z0-9\-_\.]/g, '');
  return clean.length > 0 ? clean : null;
}

const LEGACY_SCOPE_PROJECT_NAME = "__legacy_scope__";

function parseProjectIdsFromUrl(rawUrl) {
  const queryString = String(rawUrl || "").split("?")[1] || "";
  if (!queryString) return [];
  const params = new URLSearchParams(queryString);
  const candidates = [];
  const directProjectId = String(params.get("project_id") || "").trim();
  if (directProjectId) candidates.push(directProjectId);
  for (const projectIdsValue of params.getAll("project_ids")) {
    const chunkIds = parseProjectIdsInput(projectIdsValue, 100);
    for (const id of chunkIds) candidates.push(id);
  }
  return parseProjectIdsInput(candidates, 100);
}

function parseProjectIdsFromRequestPayload(payload, max = 100) {
  if (!payload || typeof payload !== "object") return [];
  const candidates = [];
  const directKeys = ["project_id", "projectId", "active_project_id", "activeProjectId"];
  const listKeys = ["project_ids", "projectIds", "selected_project_ids", "selectedProjectIds"];

  for (const key of directKeys) {
    const value = String(payload?.[key] || "").trim();
    if (value) candidates.push(value);
  }
  for (const key of listKeys) {
    const values = parseProjectIdsInput(payload?.[key], max);
    for (const item of values) candidates.push(item);
  }
  return parseProjectIdsInput(candidates, max);
}

function collectPreferredProjectIds(request) {
  const urlProjectIds = parseProjectIdsFromUrl(request.url);
  const queryProjectIds = parseProjectIdsFromRequestPayload(request.query || {}, 100);
  const bodyProjectIds = parseProjectIdsFromRequestPayload(request.body || {}, 100);
  const paramsProjectIds = parseProjectIdsFromRequestPayload(request.params || {}, 100);
  return parseProjectIdsInput(
    [...urlProjectIds, ...queryProjectIds, ...bodyProjectIds, ...paramsProjectIds],
    100
  );
}

async function pickSessionFallbackProject(pool, preferredProjectIds = []) {
  const preferredIds = parseProjectIdsInput(preferredProjectIds, 100);
  if (preferredIds.length) {
    const preferredMatch = await pool.query(
      `
        SELECT
          id::text AS id,
          account_scope_id::text AS account_scope_id
        FROM projects
        WHERE id::text = ANY($1::text[])
          AND lower(btrim(name)) <> $2
        ORDER BY array_position($1::text[], id::text)
        LIMIT 1
      `,
      [preferredIds, LEGACY_SCOPE_PROJECT_NAME]
    );
    if (preferredMatch.rows[0]) return preferredMatch.rows[0];
  }

  const fallback = await pool.query(
    `
      SELECT
        id::text AS id,
        account_scope_id::text AS account_scope_id
      FROM projects
      WHERE lower(btrim(name)) <> $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [LEGACY_SCOPE_PROJECT_NAME]
  );
  return fallback.rows[0] || null;
}

async function hydrateSessionScope(pool, sid, sessionRow, preferredProjectIds = []) {
  if (!sessionRow) return null;
  const hasProjectScope = Boolean(sessionRow.active_project_id && sessionRow.account_scope_id);
  if (hasProjectScope) return sessionRow;

  let resolvedProject = null;
  const activeProjectId = String(sessionRow.active_project_id || "").trim();
  if (activeProjectId) {
    const currentProject = await pool.query(
      `
        SELECT
          id::text AS id,
          account_scope_id::text AS account_scope_id
        FROM projects
        WHERE id::text = $1
        LIMIT 1
      `,
      [activeProjectId]
    );
    if (currentProject.rows[0]) {
      resolvedProject = currentProject.rows[0];
    }
  }

  if (!resolvedProject) {
    resolvedProject = await pickSessionFallbackProject(pool, preferredProjectIds);
  }
  if (!resolvedProject) {
    return {
      ...sessionRow,
      active_project_id: null,
      account_scope_id: null,
    };
  }

  if (String(sessionRow.active_project_id || "") !== String(resolvedProject.id || "")) {
    await pool.query(
      `
        UPDATE sessions
        SET active_project_id = $2
        WHERE session_id = $1
      `,
      [sid, resolvedProject.id]
    );
  }

  return {
    ...sessionRow,
    active_project_id: resolvedProject.id,
    account_scope_id: resolvedProject.account_scope_id,
  };
}

async function resolvePortfolioAccountScopeId(pool, request, projectIds = []) {
  const fromSession = request.auth?.account_scope_id || null;
  if (fromSession) return fromSession;

  const candidates = Array.from(
    new Set(
      [
        ...(Array.isArray(projectIds) ? projectIds : []),
        String(request.query?.project_id || "").trim(),
        String(request.auth?.active_project_id || "").trim(),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 100);

  if (!candidates.length) {
    fail(409, "account_scope_required", "Account scope is required");
  }

  const { rows } = await pool.query(
    `
      SELECT
        account_scope_id::text AS account_scope_id,
        count(*)::int AS projects_count
      FROM projects
      WHERE id::text = ANY($1::text[])
      GROUP BY account_scope_id
      ORDER BY projects_count DESC
      LIMIT 2
    `,
    [candidates]
  );

  if (!rows.length) {
    fail(404, "projects_not_found", "Projects for scope resolution were not found");
  }
  if (rows.length > 1) {
    fail(409, "account_scope_mismatch", "Selected projects belong to different account scopes");
  }
  return rows[0].account_scope_id;
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

  const trustProxyEnv = process.env.TRUST_PROXY || "";
  const trustProxy = trustProxyEnv === "true" ? true : trustProxyEnv === "false" || !trustProxyEnv ? false : trustProxyEnv;

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, request_id: req.id };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    },
    trustProxy,
    bodyLimit: 64 * 1024,
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
    genReqId: (req) => sanitizeRequestId(req.headers["x-request-id"]) || crypto.randomUUID(),
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });

  if (!isProd) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Labpics Dashboard API",
          version: "1.0.0",
          description: "Operations console API for project management, CRM, signals, and analytics",
        },
        tags: [
          { name: "health", description: "Health and metrics" },
          { name: "auth", description: "Authentication" },
          { name: "projects", description: "Project management" },
          { name: "crm", description: "CRM accounts and opportunities" },
          { name: "signals", description: "Signals and risk patterns" },
          { name: "offers", description: "Offers and upsell" },
          { name: "jobs", description: "Scheduled jobs and sync" },
          { name: "lightrag", description: "LightRAG search and query" },
          { name: "connectors", description: "Data source connectors" },
          { name: "intelligence", description: "Analytics and intelligence" },
          { name: "outbound", description: "Outbound campaigns" },
          { name: "data", description: "Portfolio data" },
        ],
        components: {
          securitySchemes: {
            cookieAuth: { type: "apiKey", in: "cookie", name: "sid" },
            apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
          },
        },
        security: [{ cookieAuth: [] }],
      },
    });
    await app.register(swaggerUi, {
      routePrefix: "/api-docs",
    });
  }

  // Security headers
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-DNS-Prefetch-Control", "off");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (isProd) {
      reply.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    }
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    );
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );
  });

  const pool = createDbPool(databaseUrl, app.log);
  const apiKeyAuthHandler = createApiKeyAuth(pool);
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const migrationsDir = path.join(currentDir, "..", "db", "migrations");
  await applyMigrations(pool, migrationsDir, app.log);

  // --- Redis Pub/Sub + SSE + Cache setup ---
  const redisPubSub = createRedisPubSub({ logger: app.log });
  const sseBroadcaster = createSseBroadcaster(app.log);
  const cache = createCacheLayer({ logger: app.log });

  if (cache.enabled) {
    app.log.info("redis cache layer active");
  }

  // --- Session touch buffer: batch last_seen_at updates ---
  const sessionTouchBuffer = new Set();
  const SESSION_TOUCH_INTERVAL_MS = 30_000;
  const sessionTouchTimer = setInterval(async () => {
    if (sessionTouchBuffer.size === 0) return;
    const sids = [...sessionTouchBuffer];
    sessionTouchBuffer.clear();
    try {
      await pool.query(
        "UPDATE sessions SET last_seen_at = now() WHERE session_id = ANY($1::text[])",
        [sids]
      );
    } catch (err) {
      app.log.warn({ error: String(err?.message || err), count: sids.length }, "session touch batch failed");
    }
  }, SESSION_TOUCH_INTERVAL_MS);
  sessionTouchTimer.unref();

  // Purge sessions inactive for more than 14 days (runs every 6 hours)
  const SESSION_EXPIRY_DAYS = 14;
  const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const sessionCleanupTimer = setInterval(async () => {
    try {
      const result = await pool.query(
        "DELETE FROM sessions WHERE last_seen_at < now() - make_interval(days => $1)",
        [SESSION_EXPIRY_DAYS]
      );
      if (result.rowCount > 0) {
        app.log.info({ purged: result.rowCount }, "expired sessions purged");
      }
    } catch (err) {
      app.log.warn({ error: String(err?.message || err) }, "session cleanup failed");
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  sessionCleanupTimer.unref();

  if (redisPubSub.enabled) {
    try {
      await redisPubSub.subscribe("job_completed", (payload) => {
        const projectId = payload?.project_id;
        if (!projectId) return;
        sseBroadcaster.broadcast(projectId, "job_completed", {
          job_type: payload.job_type,
          status: payload.status,
          at: payload.at,
        });

        // --- Cache invalidation on job completion ---
        const accountScopeId = payload?.account_scope_id;
        const jobType = String(payload?.job_type || "");
        if (accountScopeId) {
          cache.invalidateByPrefix(`portfolio:${accountScopeId}`);
        }
        cache.invalidateByPrefix(`ct:${projectId}`);
        if (["connectors_sync_cycle", "embeddings_run"].includes(jobType)) {
          cache.invalidateByPrefix(`lightrag:${projectId}`);
        }
      });
      // 44.5: Subscribe to connector sync progress events for SSE
      await redisPubSub.subscribe("connector_sync_progress", (payload) => {
        const projectId = payload?.project_id;
        if (!projectId) return;
        sseBroadcaster.broadcast(projectId, "connector_sync_progress", {
          phase: payload.phase,
          connectors: payload.connectors,
          ok: payload.ok,
          failed: payload.failed,
          total: payload.total,
          at: payload.at,
        });
      });

      app.log.info("redis pub/sub → sse bridge active (with cache invalidation)");
    } catch (err) {
      app.log.warn({ error: String(err?.message || err) }, "redis subscribe failed — degrading to polling-only mode");
    }
  } else {
    app.log.info("redis unavailable — SSE will not receive real-time events");
  }

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
    route_times: {},
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

  // Periodic cleanup of expired login attempt entries to prevent unbounded Map growth
  const LOGIN_ATTEMPTS_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const loginAttemptsCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of loginAttempts) {
      if (now - state.startedAt > loginWindowMs) {
        loginAttempts.delete(key);
      }
    }
  }, LOGIN_ATTEMPTS_CLEANUP_INTERVAL_MS);
  loginAttemptsCleanupTimer.unref();

  // --- General API rate limiting (per session + per IP for unauthenticated) ---
  const apiRateBuckets = new Map();
  const API_RATE_WINDOW_MS = 60_000;
  const API_RATE_LIMIT_SESSION = 200;   // 200 req/min per session
  const API_RATE_LIMIT_IP = 60;         // 60 req/min per IP (unauthenticated)

  function checkApiRateLimit(key, limit) {
    const now = Date.now();
    let bucket = apiRateBuckets.get(key);
    if (!bucket || now - bucket.windowStart > API_RATE_WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      apiRateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      return false;
    }
    return true;
  }

  // Cleanup stale buckets every 2 minutes
  setInterval(() => {
    const cutoff = Date.now() - API_RATE_WINDOW_MS * 2;
    for (const [key, bucket] of apiRateBuckets) {
      if (bucket.windowStart < cutoff) apiRateBuckets.delete(key);
    }
  }, 120_000).unref();

  async function createSession(username, userId = null) {
    const sid = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    await pool.query(
      `
        INSERT INTO sessions(session_id, username, user_id, active_project_id, csrf_token, created_at, last_seen_at)
        VALUES($1, $2, $3, NULL, $4, now(), now())
      `,
      [sid, username, userId, csrfToken]
    );
    return { sid, csrfToken };
  }

  async function loadSessionWithProjectScope(sid) {
    const { rows } = await pool.query(
      `
        SELECT
          s.session_id,
          s.username,
          s.user_id,
          s.active_project_id,
          s.csrf_token,
          s.created_at,
          s.last_seen_at,
          p.account_scope_id,
          u.role AS user_role
        FROM sessions AS s
        LEFT JOIN projects AS p ON p.id = s.active_project_id
        LEFT JOIN app_users AS u ON u.id = s.user_id
        WHERE s.session_id = $1
        LIMIT 1
      `,
      [sid]
    );
    return rows[0] || null;
  }

  function routePathForAuthCheck(pathName) {
    if (pathName === "/v1") return "/";
    if (pathName.startsWith("/v1/")) return pathName.slice(3);
    return pathName;
  }

  function registerGet(pathName, handler, opts) {
    app.get(pathName, opts || {}, handler);
    app.get(`/v1${pathName}`, opts || {}, handler);
  }

  function registerPost(pathName, handler, opts) {
    app.post(pathName, opts || {}, handler);
    app.post(`/v1${pathName}`, opts || {}, handler);
  }

  // Tight rate limit for expensive/CPU-intensive endpoints (10 req/min per IP+path)
  const EXPENSIVE_PATHS = new Set([
    "/search", "/lightrag/query", "/lightrag/refresh",
    "/jobs/embeddings/run", "/connectors/sync",
    "/jobs/chatwoot/sync", "/jobs/attio/sync", "/jobs/linear/sync",
  ]);
  const expensiveRateCheck = rateLimitHook({
    maxRequests: 10,
    windowMs: 60_000,
    keyFn: (request) => `expensive:${request.ip}:${request.url.split("?")[0].replace(/^\/v1/, "")}`,
  });
  app.addHook("preHandler", async (request, reply) => {
    const cleanPath = request.url.split("?")[0].replace(/^\/v1/, "");
    if (request.method === "POST" && EXPENSIVE_PATHS.has(cleanPath)) {
      await expensiveRateCheck(request, reply);
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    metrics.requests_total += 1;
    const requestId = String(request.id);
    request.requestId = requestId;
    reply.header("x-request-id", requestId);

    const rawPath = request.url.split("?")[0];
    const pathName = routePathForAuthCheck(rawPath);
    const isPublicAuth = pathName === "/auth/login" || pathName === "/auth/me" || pathName.startsWith("/auth/signup") || pathName === "/auth/telegram/webhook";
    const isPublic = pathName === "/health" || isPublicAuth || pathName.startsWith("/api-docs");

    // Rate limit unauthenticated requests by IP (except health/metrics)
    if (!isPublic) {
      const ipKey = `ip:${request.ip}`;
      if (!checkApiRateLimit(ipKey, API_RATE_LIMIT_IP)) {
        return sendError(reply, requestId, new ApiError(429, "rate_limited", "Too many requests"));
      }
    }

    // Rate limit auth endpoints by IP (stricter than general rate limit)
    if (pathName.startsWith("/auth/")) {
      const authKey = `auth:${request.ip}`;
      if (!checkApiRateLimit(authKey, 30)) { // 30 req/min for auth
        return sendError(reply, requestId, new ApiError(429, "rate_limited", "Too many requests"));
      }
    }

    if (isPublic) return;

    // API key auth: if X-API-Key header is present, authenticate via key
    if (request.headers["x-api-key"]) {
      try {
        await apiKeyAuthHandler(request);
        if (request.auth) return; // successfully authenticated via API key
      } catch (err) {
        return sendError(reply, requestId, new ApiError(err.statusCode || 401, "unauthorized", err.message));
      }
    }

    const sid = request.cookies?.[cookieName];
    if (!sid) {
      return sendError(reply, requestId, new ApiError(401, "unauthorized", "Unauthorized"));
    }

    // Session cache: check Redis first, fall back to DB
    const sessionCacheKey = `session:${sid}`;
    let sessionRow = await cache.get(sessionCacheKey);
    if (!sessionRow) {
      sessionRow = await loadSessionWithProjectScope(sid);
      if (sessionRow) await cache.set(sessionCacheKey, sessionRow, 60);
    }
    if (!sessionRow) {
      reply.clearCookie(cookieName, cookieOptions);
      reply.clearCookie(csrfCookieName, csrfCookieOptions);
      return sendError(reply, requestId, new ApiError(401, "unauthorized", "Unauthorized"));
    }

    const preferredProjectIds = parseProjectIdsFromUrl(request.url);
    request.auth = await hydrateSessionScope(pool, sid, sessionRow, preferredProjectIds);
    request._resolvedProjectIds = preferredProjectIds;
    // Batch last_seen_at updates every 30s instead of per-request
    sessionTouchBuffer.add(sid);

    // Rate limit authenticated requests by session
    const sessionKey = `session:${sid}`;
    if (!checkApiRateLimit(sessionKey, API_RATE_LIMIT_SESSION)) {
      return sendError(reply, requestId, new ApiError(429, "rate_limited", "Too many requests"));
    }

    const isMutating = !["GET", "HEAD", "OPTIONS"].includes(String(request.method || "GET").toUpperCase());

    // API key auth: enforce scopes on mutating requests, skip CSRF
    if (request.apiKey) {
      if (isMutating) {
        const scopes = request.apiKey.scopes || [];
        if (!scopes.includes("write") && !scopes.includes("admin")) {
          return sendError(reply, requestId, new ApiError(403, "scope_insufficient", "API key lacks 'write' scope for this operation"));
        }
      }
      return; // API keys don't use CSRF
    }

    if (isMutating) {
      const csrfHeader = String(request.headers["x-csrf-token"] || "");
      if (!csrfHeader || !timingSafeStringEqual(csrfHeader, request.auth.csrf_token)) {
        return sendError(reply, requestId, new ApiError(403, "csrf_invalid", "Invalid CSRF token"));
      }
    }
  });

  app.addHook("preValidation", async (request, reply) => {
    const rawPath = request.url.split("?")[0];
    const pathName = routePathForAuthCheck(rawPath);
    const isPublicAuth = pathName === "/auth/login" || pathName === "/auth/me" || pathName.startsWith("/auth/signup") || pathName === "/auth/telegram/webhook";
    const isPublic = pathName === "/health" || isPublicAuth || pathName.startsWith("/api-docs");
    if (isPublic) return;
    if (!request.auth?.session_id) return;
    if (request.auth?.active_project_id && request.auth?.account_scope_id) return;

    const preferredProjectIds = collectPreferredProjectIds(request);
    const prev = request._resolvedProjectIds;
    if (prev && prev.length === preferredProjectIds.length && prev.every((id, i) => id === preferredProjectIds[i])) return;
    request.auth = await hydrateSessionScope(pool, request.auth.session_id, request.auth, preferredProjectIds);
    request._resolvedProjectIds = preferredProjectIds;
  });

  // --- RBAC: enforce project-level access for PM users ---
  const projectAccessCheck = requireProjectAccess(pool);
  app.addHook("preHandler", async (request, reply) => {
    const rawPath = request.url.split("?")[0];
    const pathName = routePathForAuthCheck(rawPath);
    const isPublicAuth = pathName === "/auth/login" || pathName === "/auth/me" || pathName.startsWith("/auth/signup") || pathName === "/auth/telegram/webhook";
    const isPublic = pathName === "/health" || isPublicAuth || pathName.startsWith("/api-docs");
    if (isPublic) return;
    if (!request.auth?.session_id) return;

    try {
      await projectAccessCheck(request);
    } catch (err) {
      return sendError(reply, request.requestId, err);
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    metrics.responses_total += 1;
    const code = Number(reply.statusCode || 0);
    const key = Number.isFinite(code) ? String(code) : "0";
    metrics.status_counts[key] = (metrics.status_counts[key] || 0) + 1;

    // Track response time per route
    const elapsedMs = reply.elapsedTime;
    if (Number.isFinite(elapsedMs)) {
      const route = request.routeOptions?.url || "__unknown__";
      const bucket = metrics.route_times[route] || { count: 0, total_ms: 0, max_ms: 0 };
      bucket.count += 1;
      bucket.total_ms += elapsedMs;
      if (elapsedMs > bucket.max_ms) bucket.max_ms = elapsedMs;
      metrics.route_times[route] = bucket;
    }
  });

  // --- Route modules ---
  const routeCtx = {
    registerGet, registerPost, pool, cache, metrics,
    sseBroadcaster, redisPubSub, parseBody,
    // Schemas
    LoginSchema, CreateProjectSchema, CreateAccountSchema,
    CreateOpportunitySchema, UpdateStageSchema, CreateOfferSchema,
    ApproveOfferSchema, CreateOutboundDraftSchema, OptOutSchema,
    LightRagQuerySchema, LightRagFeedbackSchema, SearchSchema,
    SignalStatusSchema, NbaStatusSchema, IdentityPreviewSchema,
    IdentitySuggestionApplySchema, ConnectorRetrySchema,
    AnalyticsRefreshSchema, OutboundApproveSchema, OutboundProcessSchema,
    LoopsSyncSchema, UpsellStatusSchema, ContinuityApplySchema,
    // Auth helpers
    normalizeAccountUsername, assertLoginRateLimit, recordLoginFailure,
    clearLoginFailures, timingSafeStringEqual, auth, createSession,
    loadSessionWithProjectScope, hydrateSessionScope, parseProjectIdsFromUrl,
    cookieName, csrfCookieName, cookieOptions, csrfCookieOptions, bcrypt,
    // Parsing helpers
    parseProjectIdsInput, resolvePortfolioAccountScopeId,
    // RBAC helpers
    requireRole, getEffectiveRole, canAccessProject, getAccessibleProjectIds,
  };
  registerHealthRoutes(routeCtx);
  registerAuthRoutes(routeCtx);
  registerProjectRoutes(routeCtx);
  registerDataRoutes(routeCtx);
  registerJobRoutes(routeCtx);
  registerConnectorRoutes(routeCtx);
  registerLightragRoutes(routeCtx);
  registerIntelligenceRoutes(routeCtx);
  registerCrmRoutes(routeCtx);
  registerOfferRoutes(routeCtx);
  registerSignalRoutes(routeCtx);
  registerOutboundRoutes(routeCtx);
  registerApiKeyRoutes(routeCtx);
  registerUserRoutes(routeCtx);


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
    clearInterval(sessionTouchTimer);
    clearInterval(sessionCleanupTimer);
    clearInterval(loginAttemptsCleanupTimer);
    await cache.close();
    await redisPubSub.close();
    await pool.end();
  });

  if (!auth.hashed) {
    app.log.warn("AUTH_CREDENTIALS contains a plaintext password. Use bcrypt hash: npx bcrypt-cli hash <password>");
  }

  await app.listen({ host, port });
  app.log.info({ host, port }, "server started");

  // --- Graceful shutdown ---
  let shuttingDown = false;
  async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "graceful shutdown initiated");
    const deadlineMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30_000;
    const shutdownTimeout = setTimeout(() => {
      app.log.error({ deadline_ms: deadlineMs }, "shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, deadlineMs);
    shutdownTimeout.unref();
    try {
      await app.close();
      app.log.info("server closed gracefully");
    } catch (err) {
      app.log.error({ err: String(err?.message || err) }, "error during shutdown");
    }
    clearTimeout(shutdownTimeout);
    process.exit(0);
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
