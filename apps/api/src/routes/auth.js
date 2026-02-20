import { ApiError, sendError, sendOk } from "../infra/api-contract.js";
import { writeAuditEvent } from "../domains/core/audit.js";

/**
 * @param {object} ctx
 * @param {Function} ctx.registerGet
 * @param {Function} ctx.registerPost
 * @param {object} ctx.pool
 * @param {object} ctx.cache
 * @param {Function} ctx.parseBody
 * @param {object} ctx.LoginSchema
 * @param {Function} ctx.normalizeAccountUsername
 * @param {Function} ctx.assertLoginRateLimit
 * @param {Function} ctx.recordLoginFailure
 * @param {Function} ctx.clearLoginFailures
 * @param {Function} ctx.timingSafeStringEqual
 * @param {object} ctx.auth
 * @param {Function} ctx.createSession
 * @param {Function} ctx.loadSessionWithProjectScope
 * @param {Function} ctx.hydrateSessionScope
 * @param {Function} ctx.parseProjectIdsFromUrl
 * @param {string} ctx.cookieName
 * @param {string} ctx.csrfCookieName
 * @param {object} ctx.cookieOptions
 * @param {object} ctx.csrfCookieOptions
 * @param {object} ctx.bcrypt
 */
export function registerAuthRoutes(ctx) {
  const {
    registerGet, registerPost, pool, cache, parseBody, LoginSchema,
    normalizeAccountUsername, assertLoginRateLimit, recordLoginFailure,
    clearLoginFailures, timingSafeStringEqual, auth, createSession,
    loadSessionWithProjectScope, hydrateSessionScope, parseProjectIdsFromUrl,
    cookieName, csrfCookieName, cookieOptions, csrfCookieOptions, bcrypt,
  } = ctx;

  registerPost("/auth/login", async (request, reply) => {
    const body = parseBody(LoginSchema, request.body);
    const username = normalizeAccountUsername(body.username);
    const password = body.password;
    if (!username) {
      return sendError(reply, request.requestId, new ApiError(400, "missing_credentials", "Missing credentials"));
    }

    assertLoginRateLimit(request.ip, username);

    const DUMMY_BCRYPT_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const authUsername = normalizeAccountUsername(auth.username);
    let sessionUsername = null;
    const usernameMatches = timingSafeStringEqual(username, authUsername);
    if (auth.hashed) {
      const hashToCompare = usernameMatches ? auth.password : DUMMY_BCRYPT_HASH;
      const passwordMatch = await bcrypt.compare(password, hashToCompare);
      if (usernameMatches && passwordMatch) sessionUsername = auth.username;
    } else {
      if (usernameMatches && timingSafeStringEqual(password, auth.password)) {
        sessionUsername = auth.username;
      }
    }

    if (!sessionUsername) {
      recordLoginFailure(request.ip, username);
      writeAuditEvent(pool, {
        projectId: null, accountScopeId: null,
        actorUsername: username, action: "auth.login_failed",
        entityType: "session", entityId: null, status: "failed",
        requestId: request.requestId,
        payload: { ip: request.ip }, evidenceRefs: [],
      }).catch((err) => console.error({ action: "audit_write_failed", error: String(err?.message || err) }, "auth audit event failed"));
      return sendError(reply, request.requestId, new ApiError(401, "invalid_credentials", "Invalid credentials"));
    }

    clearLoginFailures(request.ip, username);
    const { sid, csrfToken } = await createSession(sessionUsername);
    writeAuditEvent(pool, {
      projectId: null, accountScopeId: null,
      actorUsername: sessionUsername, action: "auth.login",
      entityType: "session", entityId: sid, status: "ok",
      requestId: request.requestId,
      payload: { ip: request.ip }, evidenceRefs: [],
    }).catch((err) => console.error({ action: "audit_write_failed", error: String(err?.message || err) }, "auth audit event failed"));

    reply.setCookie(cookieName, sid, cookieOptions);
    reply.setCookie(csrfCookieName, csrfToken, csrfCookieOptions);
    return sendOk(reply, request.requestId, {
      username: sessionUsername,
      active_project_id: null,
      csrf_cookie_name: csrfCookieName,
      csrf_token: csrfToken,
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
      writeAuditEvent(pool, {
        projectId: null, accountScopeId: null,
        actorUsername: request.auth?.username || null, action: "auth.logout",
        entityType: "session", entityId: sid, status: "ok",
        requestId: request.requestId,
        payload: { ip: request.ip }, evidenceRefs: [],
      }).catch((err) => console.error({ action: "audit_write_failed", error: String(err?.message || err) }, "auth audit event failed"));
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
      csrf_token: hydrated.csrf_token,
      created_at: hydrated.created_at,
      last_seen_at: hydrated.last_seen_at,
    });
  });
}
