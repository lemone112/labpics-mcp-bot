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
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
  const signupPinTtlMinutes = toBoundedInt(process.env.SIGNUP_PIN_TTL_MINUTES, 10, 1, 30);
  const signupPinMaxAttempts = toBoundedInt(process.env.SIGNUP_PIN_MAX_ATTEMPTS, 8, 1, 20);

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

  async function createSession(username) {
    const sid = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `
        INSERT INTO sessions(session_id, username, active_project_id, created_at, last_seen_at)
        VALUES($1, $2, NULL, now(), now())
      `,
      [sid, username]
    );
    return sid;
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
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password) {
      return reply.code(400).send({ ok: false, error: "missing_credentials", request_id: request.requestId });
    }

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
      return reply.code(401).send({ ok: false, error: "invalid_credentials", request_id: request.requestId });
    }

    const sid = await createSession(sessionUsername);

    reply.setCookie(cookieName, sid, cookieOptions);
    return { ok: true, username: sessionUsername, active_project_id: null, request_id: request.requestId };
  });

  app.get("/auth/signup/status", async (request) => {
    const ownerUserId = await getAppSetting("telegram_owner_user_id");
    const ownerChatId = await getAppSetting("telegram_owner_chat_id");
    const hasTelegramToken = Boolean(telegram.botToken);
    const ownerBound = Boolean(ownerUserId && ownerChatId);
    return {
      ok: true,
      enabled: hasTelegramToken && ownerBound,
      has_telegram_token: hasTelegramToken,
      owner_bound: ownerBound,
      request_id: request.requestId,
    };
  });

  app.post("/auth/signup/start", async (request, reply) => {
    if (!telegram.botToken) {
      return reply.code(503).send({ ok: false, error: "telegram_not_configured", request_id: request.requestId });
    }

    const ownerUserId = await getAppSetting("telegram_owner_user_id");
    const ownerChatId = await getAppSetting("telegram_owner_chat_id");
    if (!ownerUserId || !ownerChatId) {
      return reply.code(409).send({ ok: false, error: "telegram_owner_not_bound", request_id: request.requestId });
    }

    const body = request.body && typeof request.body === "object" ? request.body : {};
    const username = normalizeAccountUsername(body?.username);
    const password = String(body?.password || "");

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return reply.code(400).send({ ok: false, error: "invalid_username", request_id: request.requestId });
    }
    if (password.length < 8 || password.length > 128) {
      return reply.code(400).send({ ok: false, error: "invalid_password", request_id: request.requestId });
    }

    const existingUser = await pool.query("SELECT id FROM app_users WHERE username = $1 LIMIT 1", [username]);
    if (existingUser.rows[0]) {
      return reply.code(409).send({ ok: false, error: "username_taken", request_id: request.requestId });
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
      return reply.code(502).send({ ok: false, error: "telegram_send_failed", request_id: request.requestId });
    }

    return {
      ok: true,
      signup_request_id: signupRequest.id,
      expires_at: signupRequest.expires_at,
      message: "pin_sent",
      request_id: request.requestId,
    };
  });

  app.post("/auth/signup/confirm", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const signupRequestId = String(body?.signup_request_id || body?.request_id || "").trim();
    const pin = parsePin(body?.pin);
    if (!/^[0-9a-f-]{36}$/i.test(signupRequestId) || !pin) {
      return reply.code(400).send({ ok: false, error: "invalid_payload", request_id: request.requestId });
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
      return reply.code(400).send({ ok: false, error: "signup_request_invalid", request_id: request.requestId });
    }
    if (new Date(signupRequest.expires_at).getTime() < Date.now()) {
      await pool.query("UPDATE signup_requests SET used_at = now() WHERE id = $1", [signupRequest.id]);
      return reply.code(400).send({ ok: false, error: "pin_expired", request_id: request.requestId });
    }
    if (signupRequest.attempt_count >= signupPinMaxAttempts) {
      return reply.code(429).send({ ok: false, error: "pin_attempts_exceeded", request_id: request.requestId });
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
      return reply.code(401).send({ ok: false, error: "invalid_pin", request_id: request.requestId });
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
      return reply.code(409).send({ ok: false, error: "username_taken", request_id: request.requestId });
    }

    await pool.query("UPDATE signup_requests SET used_at = now() WHERE id = $1", [signupRequest.id]);
    const sid = await createSession(insertResult.rows[0].username);
    reply.setCookie(cookieName, sid, cookieOptions);
    return {
      ok: true,
      username: insertResult.rows[0].username,
      active_project_id: null,
      request_id: request.requestId,
    };
  });

  app.post("/auth/telegram/webhook", async (request, reply) => {
    if (!telegram.botToken) {
      return reply.code(503).send({ ok: false, error: "telegram_not_configured", request_id: request.requestId });
    }

    const headerSecret = String(request.headers["x-telegram-bot-api-secret-token"] || "");
    const querySecret = String(request.query?.secret || "");
    if (telegram.webhookSecret && headerSecret !== telegram.webhookSecret && querySecret !== telegram.webhookSecret) {
      return reply.code(401).send({ ok: false, error: "invalid_webhook_secret", request_id: request.requestId });
    }

    const update = request.body && typeof request.body === "object" ? request.body : {};
    const message = update?.message || update?.edited_message || null;
    if (!message) {
      return { ok: true, request_id: request.requestId };
    }

    const userId = parseUserId(message?.from?.id);
    const chatId = parseUserId(message?.chat?.id);
    const text = String(message?.text || "").trim();
    if (!userId || !chatId) {
      return { ok: true, request_id: request.requestId };
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
      return { ok: true, owner_bound: true, request_id: request.requestId };
    }

    if (String(userId) !== String(ownerUserId)) {
      return { ok: true, request_id: request.requestId };
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

    return { ok: true, request_id: request.requestId };
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
