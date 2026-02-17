import test from "node:test";
import assert from "node:assert/strict";

import {
  ApiError,
  fail,
  toApiError,
  parseLimit,
  sendOk,
  sendError,
} from "../src/lib/api-contract.js";
import { getRequestScope, requireProjectScope } from "../src/lib/scope.js";
import { normalizeEvidenceRefs } from "../src/services/audit.js";

// ===========================================================================
// api-contract.js
// ===========================================================================

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

test("ApiError constructor sets status, code, message, details", () => {
  const err = new ApiError(404, "not_found", "Resource not found", { id: "x" });
  assert.equal(err.status, 404);
  assert.equal(err.code, "not_found");
  assert.equal(err.message, "Resource not found");
  assert.deepEqual(err.details, { id: "x" });
  assert.equal(err.name, "ApiError");
  assert.ok(err instanceof Error);
});

test("ApiError defaults details to null", () => {
  const err = new ApiError(500, "oops", "something broke");
  assert.equal(err.details, null);
});

// ---------------------------------------------------------------------------
// fail
// ---------------------------------------------------------------------------

test("fail throws ApiError", () => {
  assert.throws(() => fail(400, "bad_input", "invalid"), (err) => {
    return err instanceof ApiError && err.status === 400 && err.code === "bad_input";
  });
});

// ---------------------------------------------------------------------------
// toApiError
// ---------------------------------------------------------------------------

test("toApiError passes through existing ApiError", () => {
  const original = new ApiError(409, "conflict", "dup");
  const result = toApiError(original);
  assert.equal(result, original);
});

test("toApiError wraps plain Error in 500", () => {
  const result = toApiError(new Error("boom"));
  assert.equal(result.status, 500);
  assert.equal(result.code, "internal_error");
  assert.equal(result.message, "boom");
});

test("toApiError wraps string in 500", () => {
  const result = toApiError("some failure");
  assert.equal(result.status, 500);
  assert.ok(result.message.includes("some failure"));
});

// ---------------------------------------------------------------------------
// parseLimit
// ---------------------------------------------------------------------------

test("parseLimit returns parsed integer clamped to [1, max]", () => {
  assert.equal(parseLimit("50", 100, 500), 50);
  assert.equal(parseLimit("0", 100, 500), 1);
  assert.equal(parseLimit("999", 100, 500), 500);
});

test("parseLimit returns fallback on NaN", () => {
  assert.equal(parseLimit("abc", 100, 500), 100);
  assert.equal(parseLimit(undefined, 50, 200), 50);
  assert.equal(parseLimit(null, 25, 100), 25);
});

// ---------------------------------------------------------------------------
// sendOk
// ---------------------------------------------------------------------------

test("sendOk sends { ok: true, ...payload, request_id }", () => {
  let sentBody = null;
  let sentCode = null;
  const reply = {
    code(c) { sentCode = c; return this; },
    send(body) { sentBody = body; },
  };
  sendOk(reply, "req-123", { items: [1, 2] }, 201);
  assert.equal(sentCode, 201);
  assert.equal(sentBody.ok, true);
  assert.deepEqual(sentBody.items, [1, 2]);
  assert.equal(sentBody.request_id, "req-123");
});

// ---------------------------------------------------------------------------
// sendError
// ---------------------------------------------------------------------------

test("sendError sends { ok: false, error, message }", () => {
  let sentBody = null;
  let sentCode = null;
  const reply = {
    code(c) { sentCode = c; return this; },
    send(body) { sentBody = body; },
  };
  sendError(reply, "req-456", new ApiError(422, "validation_failed", "bad field"));
  assert.equal(sentCode, 422);
  assert.equal(sentBody.ok, false);
  assert.equal(sentBody.error, "validation_failed");
  assert.equal(sentBody.message, "bad field");
  assert.equal(sentBody.request_id, "req-456");
});

test("sendError wraps plain error as 500", () => {
  let sentCode = null;
  const reply = {
    code(c) { sentCode = c; return this; },
    send() {},
  };
  sendError(reply, "req-789", new Error("crash"));
  assert.equal(sentCode, 500);
});

// ===========================================================================
// scope.js
// ===========================================================================

// ---------------------------------------------------------------------------
// getRequestScope
// ---------------------------------------------------------------------------

test("getRequestScope extracts projectId and accountScopeId", () => {
  const scope = getRequestScope({
    auth: { active_project_id: "p1", account_scope_id: "a1" },
  });
  assert.equal(scope.projectId, "p1");
  assert.equal(scope.accountScopeId, "a1");
});

test("getRequestScope returns nulls when auth is missing", () => {
  const scope = getRequestScope({});
  assert.equal(scope.projectId, null);
  assert.equal(scope.accountScopeId, null);
});

test("getRequestScope returns nulls for null request", () => {
  const scope = getRequestScope(null);
  assert.equal(scope.projectId, null);
  assert.equal(scope.accountScopeId, null);
});

// ---------------------------------------------------------------------------
// requireProjectScope
// ---------------------------------------------------------------------------

test("requireProjectScope returns scope when both ids present", () => {
  const scope = requireProjectScope({
    auth: { active_project_id: "p2", account_scope_id: "a2" },
  });
  assert.equal(scope.projectId, "p2");
  assert.equal(scope.accountScopeId, "a2");
});

test("requireProjectScope throws ApiError 409 when projectId missing", () => {
  assert.throws(
    () => requireProjectScope({ auth: { account_scope_id: "a3" } }),
    (err) => err instanceof ApiError && err.status === 409
  );
});

test("requireProjectScope throws ApiError 409 when accountScopeId missing", () => {
  assert.throws(
    () => requireProjectScope({ auth: { active_project_id: "p4" } }),
    (err) => err instanceof ApiError && err.status === 409
  );
});

// ===========================================================================
// audit.js — normalizeEvidenceRefs
// ===========================================================================

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — null / empty
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs returns [] for null", () => {
  assert.deepEqual(normalizeEvidenceRefs(null), []);
});

test("normalizeEvidenceRefs returns [] for undefined", () => {
  assert.deepEqual(normalizeEvidenceRefs(undefined), []);
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — non-array throws 400
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs throws ApiError 400 for non-array", () => {
  assert.throws(
    () => normalizeEvidenceRefs("not an array"),
    (err) => err instanceof ApiError && err.status === 400
  );
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — string refs
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs infers source for string refs", () => {
  const result = normalizeEvidenceRefs(["cwmsg:123", "cw:456", "cwc:789"]);
  assert.equal(result.length, 3);
  assert.equal(result[0].source, "cw_messages");
  assert.equal(result[0].ref, "cwmsg:123");
  assert.equal(result[1].source, "cw_conversations");
  assert.equal(result[2].source, "cw_contacts");
});

test("normalizeEvidenceRefs infers rag_chunks for UUID-like string", () => {
  const uuid = "12345678-1234-1234-1234-123456789012";
  const result = normalizeEvidenceRefs([uuid]);
  assert.equal(result[0].source, "rag_chunks");
});

test("normalizeEvidenceRefs infers external for other strings", () => {
  const result = normalizeEvidenceRefs(["some-ref"]);
  assert.equal(result[0].source, "external");
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — object refs
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs normalizes object refs with ref field", () => {
  const result = normalizeEvidenceRefs([{ ref: "cwmsg:100", snippet: "hello" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ref, "cwmsg:100");
  assert.equal(result[0].snippet, "hello");
  assert.equal(result[0].source, "cw_messages");
});

test("normalizeEvidenceRefs uses source_ref / id as fallback for ref", () => {
  const result = normalizeEvidenceRefs([{ source_ref: "cwmsg:200" }]);
  assert.equal(result[0].ref, "cwmsg:200");
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — deduplication
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs deduplicates by source+ref key", () => {
  const refs = [
    "cwmsg:100",
    "cwmsg:100",
    "cwmsg:100",
  ];
  const result = normalizeEvidenceRefs(refs);
  assert.equal(result.length, 1);
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — limit to 50
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs limits to 50 entries", () => {
  const refs = Array.from({ length: 100 }, (_, i) => `cwmsg:${i}`);
  const result = normalizeEvidenceRefs(refs);
  assert.equal(result.length, 50);
});

// ---------------------------------------------------------------------------
// normalizeEvidenceRefs — skips invalid entries
// ---------------------------------------------------------------------------

test("normalizeEvidenceRefs skips null and objects without ref", () => {
  const result = normalizeEvidenceRefs([null, {}, { ref: "" }, { ref: "valid" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ref, "valid");
});
