import { ApiError, sendError, sendOk } from "../infra/api-contract.js";
import { writeAuditEvent } from "../domains/core/audit.js";
import type { Pool, FastifyReply, FastifyRequest } from "../types/index.js";

type RequestLike = FastifyRequest & {
  requestId: string;
  auth?: {
    username?: string | null;
    user_id?: string | null;
  };
  cookies?: Record<string, string | undefined>;
};

type ReplyLike = FastifyReply;
type RegisterFn = (
  path: string,
  handler: (request: RequestLike, reply: ReplyLike) => Promise<unknown> | unknown
) => void;

interface RouteCtx {
  registerGet: RegisterFn;
  registerPost: RegisterFn;
  pool: Pool;
  cache: {
    del: (key: string) => Promise<void> | void;
  };
  parseBody: <T>(schema: unknown, input: unknown) => T;
  LoginSchema: unknown;
  normalizeAccountUsername: (value: unknown) => string;
  assertLoginRateLimit: (ip: string, username: string) => void;
  recordLoginFailure: (ip: string, username: string) => void;
  clearLoginFailures: (ip: string, username: string) => void;
  timingSafeStringEqual: (a: string, b: string) => boolean;
  auth: {
    username: string;
    password: string;
    hashed?: boolean;
  };
  createSession: (username: string, userId: string | null) => Promise<{ sid: string; csrfToken: string }>;
  loadSessionWithProjectScope: (sid: string) => Promise<any>;
  hydrateSessionScope: (
    pool: Pool,
    sid: string,
    sessionRow: any,
    preferredProjectIds: string[]
  ) => Promise<any>;
  parseProjectIdsFromUrl: (url: string) => string[];
  cookieName: string;
  csrfCookieName: string;
  cookieOptions: Record<string, unknown>;
  csrfCookieOptions: Record<string, unknown>;
  bcrypt: {
    compare: (plain: string, hash: string) => Promise<boolean>;
  };
}

export function registerAuthRoutes(ctx: RouteCtx) {
  const {
    registerGet,
    registerPost,
    pool,
    cache,
    parseBody,
    LoginSchema,
    normalizeAccountUsername,
    assertLoginRateLimit,
    recordLoginFailure,
    clearLoginFailures,
    timingSafeStringEqual,
    auth,
    createSession,
    loadSessionWithProjectScope,
    hydrateSessionScope,
    parseProjectIdsFromUrl,
    cookieName,
    csrfCookieName,
    cookieOptions,
    csrfCookieOptions,
    bcrypt,
  } = ctx;

  registerPost("/auth/login", async (request, reply) => {
    const body = parseBody<{ username: string; password: string }>(LoginSchema, request.body);
    const username = normalizeAccountUsername(body.username);
    const password = body.password;
    if (!username) {
      return sendError(reply, request.requestId, new ApiError(400, "missing_credentials", "Missing credentials"));
    }

    assertLoginRateLimit(request.ip, username);

    const DUMMY_BCRYPT_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

    let sessionUsername: string | null = null;
    let sessionUserId: string | null = null;
    let sessionUserRole: string | null = null;

    const { rows: dbUsers } = await pool.query(
      "SELECT id, username, password_hash, role FROM app_users WHERE lower(username) = $1 LIMIT 1",
      [username]
    );
    const dbUser = (dbUsers[0] as
      | {
          id: string;
          username: string;
          password_hash: string;
          role: string;
        }
      | undefined) || null;

    if (dbUser) {
      const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
      if (passwordMatch) {
        sessionUsername = dbUser.username;
        sessionUserId = dbUser.id;
        sessionUserRole = dbUser.role;
      }
    } else {
      const authUsername = normalizeAccountUsername(auth.username);
      const usernameMatches = timingSafeStringEqual(username, authUsername);
      if (auth.hashed) {
        const hashToCompare = usernameMatches ? auth.password : DUMMY_BCRYPT_HASH;
        const passwordMatch = await bcrypt.compare(password, hashToCompare);
        if (usernameMatches && passwordMatch) {
          sessionUsername = auth.username;
          sessionUserRole = "owner";
        }
      } else if (usernameMatches && timingSafeStringEqual(password, auth.password)) {
        sessionUsername = auth.username;
        sessionUserRole = "owner";
      }
    }

    if (!sessionUsername) {
      recordLoginFailure(request.ip, username);
      void writeAuditEvent(pool, {
        projectId: null,
        accountScopeId: null,
        actorUsername: username,
        actorUserId: null,
        action: "auth.login_failed",
        entityType: "session",
        entityId: null,
        status: "failed",
        requestId: request.requestId,
        payload: { ip: request.ip },
        evidenceRefs: [],
      }).catch((err) =>
        console.error({ action: "audit_write_failed", error: String((err as Error)?.message || err) }, "auth audit event failed")
      );
      return sendError(reply, request.requestId, new ApiError(401, "invalid_credentials", "Invalid credentials"));
    }

    clearLoginFailures(request.ip, username);
    const { sid, csrfToken } = await createSession(sessionUsername, sessionUserId);
    void writeAuditEvent(pool, {
      projectId: null,
      accountScopeId: null,
      actorUsername: sessionUsername,
      actorUserId: sessionUserId,
      action: "auth.login",
      entityType: "session",
      entityId: sid,
      status: "ok",
      requestId: request.requestId,
      payload: { ip: request.ip, role: sessionUserRole },
      evidenceRefs: [],
    }).catch((err) =>
      console.error({ action: "audit_write_failed", error: String((err as Error)?.message || err) }, "auth audit event failed")
    );

    reply.setCookie(cookieName, sid, cookieOptions as any);
    reply.setCookie(csrfCookieName, csrfToken, csrfCookieOptions as any);
    return sendOk(reply, request.requestId, {
      username: sessionUsername,
      user_id: sessionUserId,
      role: sessionUserRole,
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
      void writeAuditEvent(pool, {
        projectId: null,
        accountScopeId: null,
        actorUsername: request.auth?.username || null,
        actorUserId: request.auth?.user_id || null,
        action: "auth.logout",
        entityType: "session",
        entityId: sid,
        status: "ok",
        requestId: request.requestId,
        payload: { ip: request.ip },
        evidenceRefs: [],
      }).catch((err) =>
        console.error({ action: "audit_write_failed", error: String((err as Error)?.message || err) }, "auth audit event failed")
      );
    }
    reply.clearCookie(cookieName, cookieOptions as any);
    reply.clearCookie(csrfCookieName, csrfCookieOptions as any);
    return sendOk(reply, request.requestId);
  });

  registerGet("/auth/me", async (request, reply) => {
    const sid = request.cookies?.[cookieName];
    if (!sid) return sendOk(reply, request.requestId, { authenticated: false });

    const sessionRow = await loadSessionWithProjectScope(sid);
    if (!sessionRow) {
      reply.clearCookie(cookieName, cookieOptions as any);
      reply.clearCookie(csrfCookieName, csrfCookieOptions as any);
      return sendOk(reply, request.requestId, { authenticated: false });
    }

    const preferredProjectIds = parseProjectIdsFromUrl(request.url);
    const hydrated = await hydrateSessionScope(pool, sid, sessionRow, preferredProjectIds);

    return sendOk(reply, request.requestId, {
      authenticated: true,
      username: hydrated.username,
      user_id: hydrated.user_id || null,
      role: hydrated.user_role || "owner",
      active_project_id: hydrated.active_project_id,
      account_scope_id: hydrated.account_scope_id,
      csrf_cookie_name: csrfCookieName,
      csrf_token: hydrated.csrf_token,
      created_at: hydrated.created_at,
      last_seen_at: hydrated.last_seen_at,
    });
  });
}
