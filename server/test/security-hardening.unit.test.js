import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(currentDir, "..", "src", "index.js"), "utf8");
const apiSource = readFileSync(join(currentDir, "..", "src", "lib", "api-contract.js"), "utf8");
// Route files (route handlers extracted from index.js into routes/*.js)
const authRouteSource = readFileSync(join(currentDir, "..", "src", "routes", "auth.js"), "utf8");
const projectsRouteSource = readFileSync(join(currentDir, "..", "src", "routes", "projects.js"), "utf8");
const allRouteSource = indexSource + authRouteSource + projectsRouteSource;

// ===========================================================================
// Iter 8 — Security Hardening II
// ===========================================================================

// ---------------------------------------------------------------------------
// 8.1 Login timing attack prevention
// ---------------------------------------------------------------------------

test("login handler always calls bcrypt.compare (dummy hash for wrong username)", () => {
  // The login handler must call bcrypt.compare() even when the username doesn't match,
  // using a dummy hash to prevent timing-based username enumeration.
  assert.ok(
    allRouteSource.includes("DUMMY_BCRYPT_HASH"),
    "Expected DUMMY_BCRYPT_HASH constant for timing-safe login"
  );
  // Verify the dummy hash is a valid bcrypt format
  const dummyMatch = allRouteSource.match(/DUMMY_BCRYPT_HASH\s*=\s*"(\$2[aby]\$\d{2}\$.+?)"/);
  assert.ok(dummyMatch, "DUMMY_BCRYPT_HASH must be a valid bcrypt hash string");
  assert.ok(dummyMatch[1].startsWith("$2b$10$"), "Expected $2b$10$ prefix on dummy hash");
});

test("login uses conditional hash — real hash on match, dummy on mismatch", () => {
  // bcrypt.compare is always called: with auth.password if username matches, DUMMY_BCRYPT_HASH otherwise
  assert.ok(
    allRouteSource.includes("usernameMatches ? auth.password : DUMMY_BCRYPT_HASH"),
    "Expected conditional hash selection for timing-safe login"
  );
});

// ---------------------------------------------------------------------------
// 8.2 Security headers
// ---------------------------------------------------------------------------

test("X-Frame-Options: DENY is set", () => {
  assert.ok(
    indexSource.includes('"X-Frame-Options", "DENY"'),
    "Expected X-Frame-Options: DENY header"
  );
});

test("X-Content-Type-Options: nosniff is set", () => {
  assert.ok(
    indexSource.includes('"X-Content-Type-Options", "nosniff"'),
    "Expected X-Content-Type-Options: nosniff header"
  );
});

test("Content-Security-Policy header is set", () => {
  assert.ok(
    indexSource.includes('"Content-Security-Policy"'),
    "Expected Content-Security-Policy header"
  );
  assert.ok(
    indexSource.includes("frame-ancestors 'none'"),
    "CSP must include frame-ancestors 'none'"
  );
});

test("Strict-Transport-Security is set in production mode", () => {
  assert.ok(
    indexSource.includes('"Strict-Transport-Security"'),
    "Expected Strict-Transport-Security header"
  );
  // Should be conditional on isProd
  assert.ok(
    indexSource.includes("if (isProd)"),
    "HSTS should be conditional on isProd"
  );
});

test("Referrer-Policy header is set", () => {
  assert.ok(
    indexSource.includes('"Referrer-Policy"'),
    "Expected Referrer-Policy header"
  );
});

test("X-DNS-Prefetch-Control header is set", () => {
  assert.ok(
    indexSource.includes('"X-DNS-Prefetch-Control", "off"'),
    "Expected X-DNS-Prefetch-Control: off header"
  );
});

// ---------------------------------------------------------------------------
// 8.3 Session cache invalidation on project switch
// ---------------------------------------------------------------------------

test("project select endpoint invalidates session cache", () => {
  // After UPDATE sessions, cache.del(`session:${sid}`) must be called
  // Find the /projects/:id/select handler and verify cache.del is present
  const selectHandlerIdx = allRouteSource.indexOf('"/projects/:id/select"');
  assert.ok(selectHandlerIdx > -1, "Expected /projects/:id/select endpoint");

  // Get the next ~500 chars after the handler registration to find cache.del
  const handlerSlice = allRouteSource.slice(selectHandlerIdx, selectHandlerIdx + 1000);
  assert.ok(
    handlerSlice.includes("cache.del(`session:${sid}`)"),
    "Expected cache.del for session after project switch"
  );
});

// ---------------------------------------------------------------------------
// 8.4 Periodic loginAttempts cleanup
// ---------------------------------------------------------------------------

test("loginAttempts has periodic cleanup interval", () => {
  assert.ok(
    indexSource.includes("LOGIN_ATTEMPTS_CLEANUP_INTERVAL_MS"),
    "Expected periodic cleanup constant for loginAttempts"
  );
  assert.ok(
    indexSource.includes("loginAttemptsCleanupTimer"),
    "Expected cleanup timer variable"
  );
});

test("loginAttempts cleanup iterates and deletes expired entries", () => {
  // The cleanup should iterate the Map and delete entries where (now - startedAt > loginWindowMs)
  assert.ok(
    indexSource.includes("for (const [key, state] of loginAttempts)"),
    "Expected iteration over loginAttempts Map in cleanup"
  );
});

test("loginAttempts cleanup timer is cleared on server close", () => {
  assert.ok(
    indexSource.includes("clearInterval(loginAttemptsCleanupTimer)"),
    "Expected loginAttemptsCleanupTimer to be cleared on server close"
  );
});

// ---------------------------------------------------------------------------
// 8.5 Session expiration
// ---------------------------------------------------------------------------

test("session cleanup runs on periodic interval", () => {
  assert.ok(
    indexSource.includes("SESSION_EXPIRY_DAYS"),
    "Expected SESSION_EXPIRY_DAYS constant"
  );
  assert.ok(
    indexSource.includes("SESSION_CLEANUP_INTERVAL_MS"),
    "Expected SESSION_CLEANUP_INTERVAL_MS constant"
  );
  assert.ok(
    indexSource.includes("sessionCleanupTimer"),
    "Expected sessionCleanupTimer variable"
  );
});

test("session cleanup deletes sessions older than expiry threshold", () => {
  assert.ok(
    indexSource.includes("DELETE FROM sessions WHERE last_seen_at < now()"),
    "Expected DELETE query for expired sessions"
  );
});

test("session cleanup timer is cleared on server close", () => {
  assert.ok(
    indexSource.includes("clearInterval(sessionCleanupTimer)"),
    "Expected sessionCleanupTimer to be cleared on server close"
  );
});

test("migration 0020 adds index on sessions.last_seen_at", () => {
  const migrationPath = join(currentDir, "..", "db", "migrations", "0020_session_expiration_index.sql");
  const migration = readFileSync(migrationPath, "utf8");
  assert.ok(
    migration.includes("idx_sessions_last_seen_at"),
    "Expected index name idx_sessions_last_seen_at"
  );
  assert.ok(
    migration.includes("sessions (last_seen_at)"),
    "Expected index on sessions.last_seen_at column"
  );
});

// ---------------------------------------------------------------------------
// 8.6 CSRF cookie httpOnly=true
// ---------------------------------------------------------------------------

test("CSRF cookie has httpOnly: true", () => {
  // Find the csrfCookieOptions block
  const csrfOptsIdx = indexSource.indexOf("csrfCookieOptions = {");
  assert.ok(csrfOptsIdx > -1, "Expected csrfCookieOptions definition");
  const csrfOptsSlice = indexSource.slice(csrfOptsIdx, csrfOptsIdx + 200);
  assert.ok(
    csrfOptsSlice.includes("httpOnly: true"),
    "CSRF cookie must have httpOnly: true"
  );
});

test("login response includes csrf_token in body", () => {
  // The login handler should return csrf_token in the response body
  const loginIdx = allRouteSource.indexOf('"/auth/login"');
  assert.ok(loginIdx > -1, "Expected /auth/login endpoint");
  const loginSlice = allRouteSource.slice(loginIdx, loginIdx + 3000);
  assert.ok(
    loginSlice.includes("csrf_token: csrfToken"),
    "Login response must include csrf_token in body"
  );
});

test("/auth/me response includes csrf_token", () => {
  const meIdx = allRouteSource.indexOf('"/auth/me"');
  assert.ok(meIdx > -1, "Expected /auth/me endpoint");
  const meSlice = allRouteSource.slice(meIdx, meIdx + 2000);
  assert.ok(
    meSlice.includes("csrf_token: hydrated.csrf_token"),
    "/auth/me response must include csrf_token"
  );
});

// ---------------------------------------------------------------------------
// 8.7 trustProxy configuration
// ---------------------------------------------------------------------------

test("trustProxy is configurable via TRUST_PROXY env var", () => {
  assert.ok(
    indexSource.includes("TRUST_PROXY"),
    "Expected TRUST_PROXY environment variable support"
  );
  assert.ok(
    indexSource.includes("trustProxy"),
    "Expected trustProxy in Fastify config"
  );
});

test("Fastify config includes trustProxy option", () => {
  // The Fastify constructor should include trustProxy
  const fastifyIdx = indexSource.indexOf("const app = Fastify({");
  assert.ok(fastifyIdx > -1, "Expected Fastify constructor");
  const fastifySlice = indexSource.slice(fastifyIdx, fastifyIdx + 500);
  assert.ok(
    fastifySlice.includes("trustProxy"),
    "Fastify config must include trustProxy option"
  );
});

// ---------------------------------------------------------------------------
// General security invariants
// ---------------------------------------------------------------------------

test("error handler does not leak stack traces", () => {
  // The error handler should use toApiError() which sanitizes
  assert.ok(
    indexSource.includes("toApiError(error)"),
    "Error handler must use toApiError for sanitization"
  );
  // Should not send raw error.stack to client
  assert.ok(
    !indexSource.includes("error.stack") || indexSource.includes("// error.stack"),
    "Should not send error.stack directly to client"
  );
});

test("session cookie has httpOnly: true", () => {
  const cookieOptsIdx = indexSource.indexOf("const cookieOptions = {");
  assert.ok(cookieOptsIdx > -1, "Expected cookieOptions definition");
  const cookieSlice = indexSource.slice(cookieOptsIdx, cookieOptsIdx + 200);
  assert.ok(
    cookieSlice.includes("httpOnly: true"),
    "Session cookie must have httpOnly: true"
  );
});

test("session cookie has sameSite: lax", () => {
  const cookieOptsIdx = indexSource.indexOf("const cookieOptions = {");
  const cookieSlice = indexSource.slice(cookieOptsIdx, cookieOptsIdx + 200);
  assert.ok(
    cookieSlice.includes('sameSite: "lax"'),
    "Session cookie must have sameSite: lax"
  );
});
