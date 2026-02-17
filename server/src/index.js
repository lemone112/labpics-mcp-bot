import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";

import { createDbPool } from "./lib/db.js";
import { fetchWithRetry } from "./lib/http.js";
import { ApiError, fail, parseLimit, sendError, sendOk, toApiError } from "./lib/api-contract.js";
import { requireProjectScope } from "./lib/scope.js";
import { applyMigrations } from "../db/migrate-lib.js";
import { runChatwootSync } from "./services/chatwoot.js";
import { runEmbeddings, searchChunks } from "./services/embeddings.js";
import { finishJob, getJobsStatus, startJob } from "./services/jobs.js";
import { listAuditEvents, writeAuditEvent } from "./services/audit.js";
import { approveOutbound, createOutboundDraft, listOutbound, processDueOutbounds, sendOutbound, setOptOut } from "./services/outbox.js";
import { listScheduledJobs, runSchedulerTick } from "./services/scheduler.js";

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

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeAccountUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function getTelegramConfig() {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN || "").trim();
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const pinSecret = String(process.env.SIGNUP_PIN_SECRET || "").trim();
  return {
    botToken,
    webhookSecret,
    pinSecret,
  };
}

function parseUserId(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePin(value) {
  const pin = String(value || "").trim();
  return /^\d{6}$/.test(pin) ? pin : null;
}

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password || ""), salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, encodedHash) {
  const parts = String(encodedHash || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = await scryptAsync(String(password || ""), salt, 64);
  const actual = Buffer.from(derived).toString("hex");
  return timingSafeStringEqual(actual, expectedHex);
}

function hashPin(pin, salt, secret = "") {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${pin}:${secret}`)
    .digest("hex");
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const auth = getAuthConfig();
  const telegram = getTelegramConfig();
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "0.0.0.0";
  const cookieName = process.env.SESSION_COOKIE_NAME || "sid";
  const csrfCookieName = process.env.CSRF_COOKIE_NAME || "csrf_token";
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
  const signupPinTtlMinutes = toBoundedInt(process.env.SIGNUP_PIN_TTL_MINUTES, 10, 1, 30);
  const signupPinMaxAttempts = toBoundedInt(process.env.SIGNUP_PIN_MAX_ATTEMPTS, 8, 1, 20);
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

  async function getAppSetting(key) {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = $1 LIMIT 1", [key]);
    return rows[0]?.value || null;
  }

  async function setAppSetting(key, value) {
    await pool.query(
      `
        INSERT INTO app_settings(key, value, updated_at)
        VALUES($1, $2, now())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `,
      [key, String(value)]
    );
  }

  async function sendTelegramMessage(chatId, text, logger) {
    if (!telegram.botToken) {
      throw new Error("telegram_bot_token_missing");
    }

    const response = await fetchWithRetry(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      timeoutMs: 15_000,
      retries: 2,
      logger,
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`telegram_send_failed:${response.status}:${payload.slice(0, 200)}`);
    }
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
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password) {
      return sendError(reply, request.requestId, new ApiError(400, "missing_credentials", "Missing credentials"));
    }

    assertLoginRateLimit(request.ip, username);

    let sessionUsername = null;
    if (timingSafeStringEqual(username, auth.username) && timingSafeStringEqual(password, auth.password)) {
      sessionUsername = auth.username;
    } else {
      const normalizedUsername = normalizeAccountUsername(username);
      if (normalizedUsername) {
        const { rows } = await pool.query(
          `
            SELECT username, password_hash
            FROM app_users
            WHERE username = $1
            LIMIT 1
          `,
          [normalizedUsername]
        );
        if (rows[0]) {
          const validPassword = await verifyPassword(password, rows[0].password_hash);
          if (validPassword) {
            sessionUsername = rows[0].username;
          }
        }
      }
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
    const ownerUserId = await getAppSetting("telegram_owner_user_id");
    const ownerChatId = await getAppSetting("telegram_owner_chat_id");
    const hasTelegramToken = Boolean(telegram.botToken);
    const ownerBound = Boolean(ownerUserId && ownerChatId);
    return sendOk(reply, request.requestId, {
      enabled: hasTelegramToken && ownerBound,
      has_telegram_token: hasTelegramToken,
      owner_bound: ownerBound,
    });
  });

  registerPost("/auth/signup/start", async (request, reply) => {
    if (!telegram.botToken) {
      return sendError(reply, request.requestId, new ApiError(503, "telegram_not_configured", "Telegram not configured"));
    }

    const ownerUserId = await getAppSetting("telegram_owner_user_id");
    const ownerChatId = await getAppSetting("telegram_owner_chat_id");
    if (!ownerUserId || !ownerChatId) {
      return sendError(reply, request.requestId, new ApiError(409, "telegram_owner_not_bound", "Telegram owner not bound"));
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const username = normalizeAccountUsername(body?.username);
    const password = String(body?.password || "");

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_username", "Invalid username"));
    }
    if (password.length < 8 || password.length > 128) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_password", "Invalid password"));
    }

    const existingUser = await pool.query("SELECT id FROM app_users WHERE username = $1 LIMIT 1", [username]);
    if (existingUser.rows[0]) {
      return sendError(reply, request.requestId, new ApiError(409, "username_taken", "Username already taken"));
    }

    await pool.query("DELETE FROM signup_requests WHERE used_at IS NOT NULL OR expires_at < now()");
    await pool.query("DELETE FROM signup_requests WHERE username = $1 AND used_at IS NULL", [username]);

    const passwordHash = await hashPassword(password);
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const pinSalt = crypto.randomBytes(16).toString("hex");
    const pinHash = hashPin(pin, pinSalt, telegram.pinSecret);

    const { rows } = await pool.query(
      `
        INSERT INTO signup_requests(username, password_hash, pin_hash, pin_salt, expires_at)
        VALUES($1, $2, $3, $4, now() + ($5::text || ' minutes')::interval)
        RETURNING id, expires_at
      `,
      [username, passwordHash, pinHash, pinSalt, signupPinTtlMinutes]
    );
    const signupRequest = rows[0];

    try {
      const message = [
        "New account signup request",
        `Username: ${username}`,
        `PIN: ${pin}`,
        `Expires in: ${signupPinTtlMinutes} min`,
        "",
        "If this is not expected, ignore this message.",
      ].join("\n");
      await sendTelegramMessage(ownerChatId, message, request.log);
    } catch (error) {
      await pool.query("DELETE FROM signup_requests WHERE id = $1", [signupRequest.id]);
      request.log.error({ err: String(error?.message || error), request_id: request.requestId }, "failed to send signup pin");
      return sendError(reply, request.requestId, new ApiError(502, "telegram_send_failed", "Failed to send Telegram PIN"));
    }

    return sendOk(reply, request.requestId, {
      signup_request_id: signupRequest.id,
      expires_at: signupRequest.expires_at,
      message: "pin_sent",
    });
  });

  registerPost("/auth/signup/confirm", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const signupRequestId = String(body?.signup_request_id || body?.request_id || "").trim();
    const pin = parsePin(body?.pin);
    if (!/^[0-9a-f-]{36}$/i.test(signupRequestId) || !pin) {
      return sendError(reply, request.requestId, new ApiError(400, "invalid_payload", "Invalid payload"));
    }

    const { rows } = await pool.query(
      `
        SELECT id, username, password_hash, pin_hash, pin_salt, attempt_count, expires_at, used_at
        FROM signup_requests
        WHERE id = $1
        LIMIT 1
      `,
      [signupRequestId]
    );
    const signupRequest = rows[0];
    if (!signupRequest || signupRequest.used_at) {
      return sendError(reply, request.requestId, new ApiError(400, "signup_request_invalid", "Signup request invalid"));
    }
    if (new Date(signupRequest.expires_at).getTime() < Date.now()) {
      await pool.query("UPDATE signup_requests SET used_at = now() WHERE id = $1", [signupRequest.id]);
      return sendError(reply, request.requestId, new ApiError(400, "pin_expired", "PIN expired"));
    }
    if (signupRequest.attempt_count >= signupPinMaxAttempts) {
      return sendError(reply, request.requestId, new ApiError(429, "pin_attempts_exceeded", "PIN attempts exceeded"));
    }

    const expectedPinHash = hashPin(pin, signupRequest.pin_salt, telegram.pinSecret);
    if (!timingSafeStringEqual(expectedPinHash, signupRequest.pin_hash)) {
      const nextAttempts = signupRequest.attempt_count + 1;
      await pool.query(
        `
          UPDATE signup_requests
          SET attempt_count = $2,
              used_at = CASE WHEN $2 >= $3 THEN now() ELSE used_at END
          WHERE id = $1
        `,
        [signupRequest.id, nextAttempts, signupPinMaxAttempts]
      );
      return sendError(reply, request.requestId, new ApiError(401, "invalid_pin", "Invalid PIN"));
    }

    const insertResult = await pool.query(
      `
        INSERT INTO app_users(username, password_hash)
        VALUES($1, $2)
        ON CONFLICT (username) DO NOTHING
        RETURNING id, username
      `,
      [signupRequest.username, signupRequest.password_hash]
    );
    if (!insertResult.rows[0]) {
      await pool.query("UPDATE signup_requests SET used_at = now() WHERE id = $1", [signupRequest.id]);
      return sendError(reply, request.requestId, new ApiError(409, "username_taken", "Username already taken"));
    }

    await pool.query("UPDATE signup_requests SET used_at = now() WHERE id = $1", [signupRequest.id]);
    const { sid, csrfToken } = await createSession(insertResult.rows[0].username);
    reply.setCookie(cookieName, sid, cookieOptions);
    reply.setCookie(csrfCookieName, csrfToken, csrfCookieOptions);
    return sendOk(reply, request.requestId, {
      username: insertResult.rows[0].username,
      active_project_id: null,
      csrf_cookie_name: csrfCookieName,
    });
  });

  registerPost("/auth/telegram/webhook", async (request, reply) => {
    if (!telegram.botToken) {
      return sendError(reply, request.requestId, new ApiError(503, "telegram_not_configured", "Telegram not configured"));
    }

    const headerSecret = String(request.headers["x-telegram-bot-api-secret-token"] || "");
    const querySecret = String(request.query?.secret || "");
    if (telegram.webhookSecret && headerSecret !== telegram.webhookSecret && querySecret !== telegram.webhookSecret) {
      return sendError(reply, request.requestId, new ApiError(401, "invalid_webhook_secret", "Invalid webhook secret"));
    }

    const update = request.body && typeof request.body === "object" ? request.body : {};
    const message = update?.message || update?.edited_message || null;
    if (!message) {
      return sendOk(reply, request.requestId);
    }

    const userId = parseUserId(message?.from?.id);
    const chatId = parseUserId(message?.chat?.id);
    const text = String(message?.text || "").trim();
    if (!userId || !chatId) {
      return sendOk(reply, request.requestId);
    }

    const normalizedText = text.toLowerCase();
    const wantsBind = normalizedText.startsWith("/bind");
    const ownerUserId = await getAppSetting("telegram_owner_user_id");
    if (!ownerUserId || wantsBind) {
      await setAppSetting("telegram_owner_user_id", String(userId));
      await setAppSetting("telegram_owner_chat_id", String(chatId));
      try {
        await sendTelegramMessage(
          chatId,
          `Owner bound successfully.\nuser_id: ${userId}\nchat_id: ${chatId}\n\nUse /whoami to see this again.`,
          request.log
        );
      } catch (error) {
        request.log.warn(
          { err: String(error?.message || error), request_id: request.requestId },
          "telegram bind confirmation send failed"
        );
      }
      return sendOk(reply, request.requestId, { owner_bound: true });
    }

    if (String(userId) !== String(ownerUserId)) {
      return sendOk(reply, request.requestId);
    }

    await setAppSetting("telegram_owner_chat_id", String(chatId));
    if (normalizedText.startsWith("/whoami")) {
      try {
        await sendTelegramMessage(chatId, `user_id: ${userId}\nchat_id: ${chatId}`, request.log);
      } catch (error) {
        request.log.warn(
          { err: String(error?.message || error), request_id: request.requestId },
          "telegram whoami response failed"
        );
      }
    }

    return sendOk(reply, request.requestId);
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
