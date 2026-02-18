import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import bcrypt from "bcrypt";

import { createDbPool } from "./lib/db.js";
import { ApiError, fail, parseLimit, sendError, sendOk, toApiError } from "./lib/api-contract.js";
import { requireProjectScope } from "./lib/scope.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { runEmbeddings } from "./services/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "./services/jobs.js";
import { listAuditEvents, normalizeEvidenceRefs, writeAuditEvent } from "./services/audit.js";
import { approveOutbound, createOutboundDraft, listOutbound, processDueOutbounds, sendOutbound, setOptOut } from "./services/outbox.js";
import { listScheduledJobs, runSchedulerTick } from "./services/scheduler.js";
import {
  listConnectorErrors,
  listConnectorSyncState,
  retryConnectorErrors,
  runAllConnectorsSync,
  runConnectorSync,
} from "./services/connector-sync.js";
import { listSyncReconciliation, runSyncReconciliation } from "./services/reconciliation.js";
import { applyIdentitySuggestions, listIdentityLinks, listIdentitySuggestions, previewIdentitySuggestions } from "./services/identity-graph.js";
import { extractSignalsAndNba, getTopNba, listNba, listSignals, updateNbaStatus, updateSignalStatus } from "./services/signals.js";
import { listUpsellRadar, refreshUpsellRadar, updateUpsellStatus } from "./services/upsell.js";
import { applyContinuityActions, buildContinuityPreview, listContinuityActions } from "./services/continuity.js";
import { getPortfolioMessages, getPortfolioOverview } from "./services/portfolio.js";
import { syncLoopsContacts } from "./services/loops.js";
import { getLightRagStatus, queryLightRag, refreshLightRag } from "./services/lightrag.js";
import { listKagRecommendations, listKagScores, listKagSignals, runKagRecommendationRefresh } from "./services/kag.js";
import { listProjectEvents } from "./services/event-log.js";
import { buildProjectSnapshot, listPastCaseOutcomes, listProjectSnapshots } from "./services/snapshots.js";
import { findSimilarCases, rebuildCaseSignatures } from "./services/similarity.js";
import { listRiskForecasts, refreshRiskForecasts } from "./services/forecasting.js";
import {
  listRecommendationsV2,
  markRecommendationsV2Shown,
  refreshRecommendationsV2,
  updateRecommendationV2Feedback,
  updateRecommendationV2Status,
} from "./services/recommendations-v2.js";
import {
  listRecommendationActionRuns,
  retryRecommendationActionRun,
  runRecommendationAction,
} from "./services/recommendation-actions.js";
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
import { createRedisPubSub } from "./lib/redis-pubsub.js";
import { createSseBroadcaster } from "./lib/sse-broadcaster.js";
import { createCacheLayer, cacheKeyHash } from "./lib/cache.js";
import { getCircuitBreakerStates } from "./lib/http.js";
import { requiredEnv } from "./lib/utils.js";

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

function isKagRoute(pathName) {
  const normalized = String(pathName || "");
  return normalized === "/kag" || normalized.startsWith("/kag/");
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
  const lightRagOnly = toBoolean(process.env.LIGHTRAG_ONLY, true);
  const loginRateLimitMaxAttempts = toBoundedInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 10, 3, 100);
  const loginRateLimitWindowMinutes = toBoundedInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 15, 1, 1440);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      serializers: {
        req(req) {
          return { method: req.method, url: req.url, request_id: req.headers?.["x-request-id"] || req.id };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    },
    bodyLimit: 64 * 1024,
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
    genReqId: (req) => req.headers["x-request-id"] || crypto.randomUUID(),
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

  if (redisPubSub.enabled) {
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
    app.log.info("redis pub/sub → sse bridge active (with cache invalidation)");
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

  async function loadSessionWithProjectScope(sid) {
    const { rows } = await pool.query(
      `
        SELECT
          s.session_id,
          s.username,
          s.active_project_id,
          s.csrf_token,
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
    return rows[0] || null;
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

    // Rate limit unauthenticated requests by IP (except health/metrics)
    if (!isPublic) {
      const ipKey = `ip:${request.ip}`;
      if (!checkApiRateLimit(ipKey, API_RATE_LIMIT_IP)) {
        return sendError(reply, requestId, new ApiError(429, "rate_limited", "Too many requests"));
      }
    }

    if (isPublic) return;

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
    // Batch last_seen_at updates every 30s instead of per-request
    sessionTouchBuffer.add(sid);

    // Rate limit authenticated requests by session
    const sessionKey = `session:${sid}`;
    if (!checkApiRateLimit(sessionKey, API_RATE_LIMIT_SESSION)) {
      return sendError(reply, requestId, new ApiError(429, "rate_limited", "Too many requests"));
    }

    const isMutating = !["GET", "HEAD", "OPTIONS"].includes(String(request.method || "GET").toUpperCase());
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
    const isPublic = pathName === "/health" || pathName === "/metrics" || pathName.startsWith("/auth/");
    if (isPublic) return;
    if (!request.auth?.session_id) return;
    if (request.auth?.active_project_id && request.auth?.account_scope_id) return;

    const preferredProjectIds = collectPreferredProjectIds(request);
    request.auth = await hydrateSessionScope(pool, request.auth.session_id, request.auth, preferredProjectIds);

    if (lightRagOnly && isKagRoute(pathName)) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(410, "kag_disabled", "KAG routes are disabled in LIGHTRAG_ONLY mode")
      );
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
    const sseStats = sseBroadcaster.getStats();
    const cacheStats = cache.getStats();
    const mem = process.memoryUsage();
    const cbStates = getCircuitBreakerStates();
    const lines = [
      // --- HTTP ---
      "# TYPE app_requests_total counter",
      `app_requests_total ${metrics.requests_total}`,
      "# TYPE app_responses_total counter",
      `app_responses_total ${metrics.responses_total}`,
      "# TYPE app_errors_total counter",
      `app_errors_total ${metrics.errors_total}`,
      // --- SSE ---
      "# TYPE app_sse_connections_total gauge",
      `app_sse_connections_total ${sseStats.total_connections}`,
      "# TYPE app_sse_projects_subscribed gauge",
      `app_sse_projects_subscribed ${sseStats.projects}`,
      // --- Cache ---
      "# TYPE app_cache_hits_total counter",
      `app_cache_hits_total ${cacheStats.hits}`,
      "# TYPE app_cache_misses_total counter",
      `app_cache_misses_total ${cacheStats.misses}`,
      "# TYPE app_cache_sets_total counter",
      `app_cache_sets_total ${cacheStats.sets}`,
      "# TYPE app_cache_invalidations_total counter",
      `app_cache_invalidations_total ${cacheStats.invalidations}`,
      "# TYPE app_cache_enabled gauge",
      `app_cache_enabled ${cacheStats.enabled ? 1 : 0}`,
      // --- DB Pool ---
      "# TYPE app_db_pool_total gauge",
      `app_db_pool_total ${pool.totalCount}`,
      "# TYPE app_db_pool_idle gauge",
      `app_db_pool_idle ${pool.idleCount}`,
      "# TYPE app_db_pool_waiting gauge",
      `app_db_pool_waiting ${pool.waitingCount}`,
      // --- Process ---
      "# TYPE app_process_uptime_seconds gauge",
      `app_process_uptime_seconds ${Math.floor(process.uptime())}`,
      "# TYPE app_process_heap_bytes gauge",
      `app_process_heap_bytes ${mem.heapUsed}`,
      "# TYPE app_process_rss_bytes gauge",
      `app_process_rss_bytes ${mem.rss}`,
    ];
    // --- HTTP status breakdown ---
    for (const [statusCode, count] of Object.entries(metrics.status_counts)) {
      lines.push(`app_response_status_total{status="${statusCode}"} ${count}`);
    }
    // --- Circuit breakers ---
    for (const cb of cbStates) {
      lines.push(`app_circuit_breaker_state{host="${cb.name}",state="${cb.state}"} ${cb.state === "open" ? 1 : 0}`);
      lines.push(`app_circuit_breaker_failures{host="${cb.name}"} ${cb.failureCount}`);
    }
    reply.type("text/plain; version=0.0.4");
    return lines.join("\n");
  });

  // --- SSE endpoint for real-time dashboard updates ---
  registerGet("/events/stream", async (request, reply) => {
    const scope = requireProjectScope(request);

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ project_id: scope.projectId, redis: redisPubSub.enabled })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    const removeClient = sseBroadcaster.addClient(
      scope.projectId,
      reply,
      request.auth?.session_id || null
    );

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
    });
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
    let sessionUsername = null;
    if (timingSafeStringEqual(username, authUsername)) {
      const passwordMatch = auth.hashed
        ? await bcrypt.compare(password, auth.password)
        : timingSafeStringEqual(password, auth.password);
      if (passwordMatch) sessionUsername = auth.username;
    }

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
    if (sid) {
      await pool.query("DELETE FROM sessions WHERE session_id = $1", [sid]);
      await cache.del(`session:${sid}`);
    }
    reply.clearCookie(cookieName, cookieOptions);
    reply.clearCookie(csrfCookieName, csrfCookieOptions);
    return sendOk(reply, request.requestId);
  });

  registerGet("/auth/me", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (!sid) return sendOk(reply, request.requestId, { authenticated: false });

    const sessionRow = await loadSessionWithProjectScope(sid);
    if (!sessionRow) {
      reply.clearCookie(cookieName, cookieOptions);
      reply.clearCookie(csrfCookieName, csrfCookieOptions);
      return sendOk(reply, request.requestId, { authenticated: false });
    }

    const preferredProjectIds = parseProjectIdsFromUrl(request.url);
    const hydrated = await hydrateSessionScope(pool, sid, sessionRow, preferredProjectIds);

    return sendOk(reply, request.requestId, {
      authenticated: true,
      username: hydrated.username,
      active_project_id: hydrated.active_project_id,
      account_scope_id: hydrated.account_scope_id,
      csrf_cookie_name: csrfCookieName,
      created_at: hydrated.created_at,
      last_seen_at: hydrated.last_seen_at,
    });
  });

  registerGet("/projects", async (request, reply) => {
    const { rows } = await pool.query(
      `
        SELECT id, name, account_scope_id, created_at
        FROM projects
        WHERE lower(btrim(name)) <> $1
        ORDER BY created_at DESC
      `,
      [LEGACY_SCOPE_PROJECT_NAME]
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
    if (name.toLowerCase() === LEGACY_SCOPE_PROJECT_NAME) {
      return sendError(reply, request.requestId, new ApiError(400, "reserved_name", "Project name is reserved"));
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
    if (String(project.rows[0].name || "").trim().toLowerCase() === LEGACY_SCOPE_PROJECT_NAME) {
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
      const sync = await runConnectorSync(pool, scope, "chatwoot", request.log);
      const result = sync.result;
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
      const sync = await runConnectorSync(pool, scope, "attio", request.log);
      const result = sync.result;
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
      const sync = await runConnectorSync(pool, scope, "linear", request.log);
      const result = sync.result;
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

  registerGet("/connectors/state", async (request, reply) => {
    const scope = requireProjectScope(request);
    const connectors = await listConnectorSyncState(pool, scope);
    return sendOk(reply, request.requestId, { connectors });
  });

  registerGet("/connectors/errors", async (request, reply) => {
    const scope = requireProjectScope(request);
    const errors = await listConnectorErrors(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { errors });
  });

  registerGet("/connectors/reconciliation", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await listSyncReconciliation(pool, scope, {
      days: request.query?.days,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, result);
  });

  registerPost("/connectors/reconciliation/run", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await runSyncReconciliation(pool, scope, {
      source: "manual",
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.reconciliation.run",
      entityType: "sync_reconciliation_metrics",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result.summary,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/connectors/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await runAllConnectorsSync(pool, scope, request.log);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.sync_all",
      entityType: "connector",
      entityId: scope.projectId,
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerPost("/connectors/:name/sync", async (request, reply) => {
    const scope = requireProjectScope(request);
    const connectorName = String(request.params?.name || "").trim().toLowerCase();
    try {
      const result = await runConnectorSync(pool, scope, connectorName, request.log);
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "connectors.sync_one",
        entityType: "connector",
        entityId: connectorName,
        status: "ok",
        requestId: request.requestId,
        payload: result,
        evidenceRefs: [],
      });
      return sendOk(reply, request.requestId, { result });
    } catch (error) {
      const message = String(error?.message || error || "connector_sync_failed");
      return sendError(reply, request.requestId, new ApiError(500, "connector_sync_failed", message));
    }
  });

  registerPost("/connectors/errors/retry", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const result = await retryConnectorErrors(pool, scope, {
      limit: body?.limit,
      logger: request.log,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "connectors.retry_errors",
      entityType: "connector_error",
      entityId: scope.projectId,
      status: result.failed > 0 ? "partial" : "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
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

    const result = await queryLightRag(
      pool,
      scope,
      { query, topK, sourceLimit: body?.sourceLimit, createdBy: request.auth?.username || null },
      request.log
    );
    return sendOk(reply, request.requestId, {
      ...result,
      results: result.chunks,
      mode: "lightrag",
    });
  });

  registerGet("/lightrag/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const status = await getLightRagStatus(pool, scope);
    return sendOk(reply, request.requestId, status);
  });

  registerPost("/lightrag/query", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const query = String(body?.query || "").trim();
    if (!query) {
      return sendError(reply, request.requestId, new ApiError(400, "query_required", "Query is required"));
    }
    const topK = toTopK(body?.topK, 10);

    const ragCacheKey = `lightrag:${scope.projectId}:${cacheKeyHash(query, String(topK))}`;
    const cached = await cache.get(ragCacheKey);
    if (cached) return sendOk(reply, request.requestId, { ...cached, cached: true });

    const result = await queryLightRag(
      pool,
      scope,
      { query, topK, sourceLimit: body?.sourceLimit, createdBy: request.auth?.username || null },
      request.log
    );
    await cache.set(ragCacheKey, result, 300);
    return sendOk(reply, request.requestId, result);
  });

  registerPost("/lightrag/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshLightRag(pool, scope, request.log);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "lightrag.refresh",
      entityType: "lightrag",
      entityId: scope.projectId,
      status: result?.embeddings?.status || "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/control-tower", async (request, reply) => {
    const scope = requireProjectScope(request);
    const ctCacheKey = `ct:${scope.projectId}`;
    const cached = await cache.get(ctCacheKey);
    if (cached) return sendOk(reply, request.requestId, cached);

    const payload = await getControlTower(pool, scope);
    await cache.set(ctCacheKey, payload, 120);
    return sendOk(reply, request.requestId, payload);
  });

  registerGet("/portfolio/overview", async (request, reply) => {
    const projectIds = parseProjectIdsInput(request.query?.project_ids, 100);
    const accountScopeId = await resolvePortfolioAccountScopeId(pool, request, projectIds);

    const portfolioCacheKey = `portfolio:${accountScopeId}:${cacheKeyHash(...projectIds.sort())}`;
    const cached = await cache.get(portfolioCacheKey);
    if (cached) return sendOk(reply, request.requestId, cached);

    const payload = await getPortfolioOverview(pool, {
      accountScopeId,
      activeProjectId: request.auth?.active_project_id || null,
      projectIds,
      messageLimit: request.query?.message_limit,
      cardLimit: request.query?.card_limit,
    });
    await cache.set(portfolioCacheKey, payload, 90);
    return sendOk(reply, request.requestId, payload);
  });

  registerGet("/portfolio/messages", async (request, reply) => {
    const projectIdCandidate = String(request.query?.project_id || "").trim();
    const accountScopeId = await resolvePortfolioAccountScopeId(
      pool,
      request,
      projectIdCandidate ? [projectIdCandidate] : []
    );

    const payload = await getPortfolioMessages(pool, {
      accountScopeId,
      projectId: request.query?.project_id,
      contactGlobalId: request.query?.contact_global_id,
      limit: request.query?.limit,
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

  registerPost("/kag/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await runKagRecommendationRefresh(pool, scope);
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "kag.refresh",
      entityType: "kag_recommendation",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/kag/signals", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listKagSignals(pool, scope, request.query?.limit);
    return sendOk(reply, request.requestId, { signals: rows });
  });

  registerGet("/kag/scores", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listKagScores(pool, scope, request.query?.limit);
    return sendOk(reply, request.requestId, { scores: rows });
  });

  registerGet("/kag/recommendations", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listKagRecommendations(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { recommendations: rows });
  });

  registerGet("/kag/events", async (request, reply) => {
    const scope = requireProjectScope(request);
    const rows = await listProjectEvents(pool, scope, {
      type: request.query?.type,
      source: request.query?.source,
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { events: rows });
  });

  registerPost("/kag/snapshots/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await buildProjectSnapshot(pool, scope, {
      snapshot_date: request.body?.snapshot_date,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "kag.snapshot.refresh",
      entityType: "project_snapshot",
      entityId: result.snapshot_date,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/kag/snapshots", async (request, reply) => {
    const scope = requireProjectScope(request);
    const snapshots = await listProjectSnapshots(pool, scope, {
      limit: request.query?.limit,
      include_unpublished: request.query?.include_unpublished,
    });
    return sendOk(reply, request.requestId, { snapshots });
  });

  registerGet("/kag/outcomes", async (request, reply) => {
    const scope = requireProjectScope(request);
    const outcomes = await listPastCaseOutcomes(pool, scope, {
      limit: request.query?.limit,
      outcome_type: request.query?.outcome_type,
    });
    return sendOk(reply, request.requestId, { outcomes });
  });

  registerPost("/kag/similarity/rebuild", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const result = await rebuildCaseSignatures(pool, scope, {
      project_id: body?.project_id,
      window_days: body?.window_days,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "kag.similarity.rebuild",
      entityType: "case_signature",
      entityId: String(body?.project_id || scope.projectId),
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: [],
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/kag/similar-cases", async (request, reply) => {
    const scope = requireProjectScope(request);
    const cases = await findSimilarCases(pool, scope, {
      project_id: request.query?.project_id,
      window_days: request.query?.window_days,
      top_k: request.query?.top_k,
    });
    return sendOk(reply, request.requestId, { cases: cases.slice(0, 3), all: cases });
  });

  registerPost("/kag/v2/forecast/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const result = await refreshRiskForecasts(pool, scope, {
      project_id: body?.project_id,
      window_days: body?.window_days,
      top_k: body?.top_k,
    });
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "kag.v2.forecast.refresh",
      entityType: "kag_risk_forecast",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: result,
      evidenceRefs: result.forecasts.flatMap((item) => item.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/kag/v2/forecast", async (request, reply) => {
    const scope = requireProjectScope(request);
    const forecasts = await listRiskForecasts(pool, scope, {
      include_unpublished: request.query?.include_unpublished,
    });
    const similarCases = await findSimilarCases(pool, scope, {
      project_id: request.query?.project_id || scope.projectId,
      window_days: request.query?.window_days,
      top_k: request.query?.top_k || 3,
    });
    return sendOk(reply, request.requestId, {
      forecasts,
      similar_cases_top3: similarCases.slice(0, 3),
    });
  });

  registerPost("/kag/v2/recommendations/refresh", async (request, reply) => {
    const scope = requireProjectScope(request);
    const result = await refreshRecommendationsV2(pool, scope, {});
    await writeAuditEvent(pool, {
      projectId: scope.projectId,
      accountScopeId: scope.accountScopeId,
      actorUsername: request.auth?.username || null,
      action: "kag.v2.recommendations.refresh",
      entityType: "recommendations_v2",
      entityId: scope.projectId,
      status: "ok",
      requestId: request.requestId,
      payload: { touched: result.touched, generated: result.generated },
      evidenceRefs: result.recommendations.flatMap((item) => item.evidence_refs || []),
    });
    return sendOk(reply, request.requestId, { result });
  });

  registerGet("/kag/v2/recommendations", async (request, reply) => {
    const scope = requireProjectScope(request);
    const recommendations = await listRecommendationsV2(pool, scope, {
      status: request.query?.status,
      limit: request.query?.limit,
      all_projects: request.query?.all_projects,
      include_hidden: request.query?.include_hidden,
    });
    return sendOk(reply, request.requestId, { recommendations });
  });

  registerPost("/kag/v2/recommendations/shown", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const recommendationIds = Array.isArray(body?.recommendation_ids) ? body.recommendation_ids : [];
    const allProjects = String(body?.all_projects || request.query?.all_projects || "").trim().toLowerCase() === "true";
    const shown = await markRecommendationsV2Shown(pool, scope, recommendationIds, {
      all_projects: allProjects ? "true" : "false",
    });
    if (shown.length) {
      await writeAuditEvent(pool, {
        projectId: allProjects ? shown[0].project_id : scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "recommendation_shown",
        entityType: "recommendations_v2",
        entityId: allProjects ? scope.accountScopeId : scope.projectId,
        status: "ok",
        requestId: request.requestId,
        payload: {
          total: shown.length,
          recommendation_ids: shown.map((item) => item.id),
          all_projects: allProjects,
        },
        evidenceRefs: shown.flatMap((item) => item.evidence_refs || []),
      });
    }
    return sendOk(reply, request.requestId, { shown });
  });

  registerPost("/kag/v2/recommendations/:id/status", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const allProjects = String(body?.all_projects || request.query?.all_projects || "").trim().toLowerCase() === "true";
    try {
      const recommendation = await updateRecommendationV2Status(
        pool,
        scope,
        String(request.params?.id || ""),
        String(body?.status || ""),
        { all_projects: allProjects ? "true" : "false" }
      );
      if (!recommendation) {
        return sendError(reply, request.requestId, new ApiError(404, "recommendation_not_found", "Recommendation not found"));
      }
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "recommendation_status_updated",
        entityType: "recommendations_v2",
        entityId: recommendation.id,
        status: "ok",
        requestId: request.requestId,
        payload: {
          status: recommendation.status,
        },
        evidenceRefs: recommendation.evidence_refs || [],
      });
      return sendOk(reply, request.requestId, { recommendation });
    } catch (error) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_status", String(error?.message || error)));
    }
  });

  registerPost("/kag/v2/recommendations/:id/feedback", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const allProjects = String(body?.all_projects || request.query?.all_projects || "").trim().toLowerCase() === "true";
    try {
      const recommendation = await updateRecommendationV2Feedback(
        pool,
        scope,
        String(request.params?.id || ""),
        String(body?.helpful || "unknown"),
        String(body?.note || ""),
        { all_projects: allProjects ? "true" : "false" }
      );
      if (!recommendation) {
        return sendError(reply, request.requestId, new ApiError(404, "recommendation_not_found", "Recommendation not found"));
      }
      await writeAuditEvent(pool, {
        projectId: scope.projectId,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "recommendation_feedback_updated",
        entityType: "recommendations_v2",
        entityId: recommendation.id,
        status: "ok",
        requestId: request.requestId,
        payload: {
          helpful_feedback: recommendation.helpful_feedback,
        },
        evidenceRefs: recommendation.evidence_refs || [],
      });
      return sendOk(reply, request.requestId, { recommendation });
    } catch (error) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_feedback", String(error?.message || error)));
    }
  });

  registerGet("/kag/v2/recommendations/:id/actions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const allProjects = String(request.query?.all_projects || "").trim().toLowerCase() === "true";
    const runs = await listRecommendationActionRuns(pool, scope, String(request.params?.id || ""), {
      all_projects: allProjects ? "true" : "false",
      limit: request.query?.limit,
    });
    return sendOk(reply, request.requestId, { actions: runs });
  });

  registerPost("/kag/v2/recommendations/:id/actions", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const allProjects = String(body?.all_projects || request.query?.all_projects || "").trim().toLowerCase() === "true";
    try {
      const result = await runRecommendationAction(
        pool,
        scope,
        String(request.params?.id || ""),
        String(body?.action_type || ""),
        body?.action_payload || {},
        {
          all_projects: allProjects ? "true" : "false",
          actorUsername: request.auth?.username || null,
          requestId: request.requestId,
        }
      );
      await writeAuditEvent(pool, {
        projectId: result.recommendation.project_id,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "recommendation_action_taken",
        entityType: "recommendation_action_run",
        entityId: result.run?.id || null,
        status: result.run?.status || "failed",
        requestId: request.requestId,
        payload: {
          recommendation_id: result.recommendation.id,
          action_type: result.run?.action_type,
          action_status: result.run?.status,
          attempts: result.run?.attempts,
          correlation_id: result.run?.correlation_id || null,
          error_message: result.run?.error_message || null,
          idempotent: Boolean(result.idempotent),
        },
        evidenceRefs: result.recommendation.evidence_refs || [],
      });
      if (result.error) {
        return sendError(reply, request.requestId, new ApiError(409, "recommendation_action_failed", String(result.error?.message || result.error)));
      }
      return sendOk(reply, request.requestId, result);
    } catch (error) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "recommendation_action_invalid", String(error?.message || error))
      );
    }
  });

  registerPost("/kag/v2/recommendations/actions/:actionId/retry", async (request, reply) => {
    const scope = requireProjectScope(request);
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const allProjects = String(body?.all_projects || request.query?.all_projects || "").trim().toLowerCase() === "true";
    try {
      const result = await retryRecommendationActionRun(pool, scope, String(request.params?.actionId || ""), {
        all_projects: allProjects ? "true" : "false",
        actorUsername: request.auth?.username || null,
        requestId: request.requestId,
      });
      await writeAuditEvent(pool, {
        projectId: result.recommendation.project_id,
        accountScopeId: scope.accountScopeId,
        actorUsername: request.auth?.username || null,
        action: "recommendation_action_taken",
        entityType: "recommendation_action_run",
        entityId: result.run?.id || null,
        status: result.run?.status || "failed",
        requestId: request.requestId,
        payload: {
          recommendation_id: result.recommendation.id,
          action_type: result.run?.action_type,
          action_status: result.run?.status,
          attempts: result.run?.attempts,
          correlation_id: result.run?.correlation_id || null,
          retry: true,
        },
        evidenceRefs: result.recommendation.evidence_refs || [],
      });
      if (result.error) {
        return sendError(reply, request.requestId, new ApiError(409, "recommendation_action_failed", String(result.error?.message || result.error)));
      }
      return sendOk(reply, request.requestId, result);
    } catch (error) {
      return sendError(
        reply,
        request.requestId,
        new ApiError(400, "recommendation_action_retry_invalid", String(error?.message || error))
      );
    }
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
    clearInterval(sessionTouchTimer);
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
    const shutdownTimeout = setTimeout(() => {
      app.log.error("shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, 10_000);
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
