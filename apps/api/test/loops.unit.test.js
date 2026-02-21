import test from "node:test";
import assert from "node:assert/strict";

import { syncLoopsContacts } from "../src/domains/outbound/loops.js";

test("syncLoopsContacts rejects missing account scope", async () => {
  const pool = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    () => syncLoopsContacts(pool, { accountScopeId: null }),
    (err) => err?.code === "account_scope_required" && err?.status === 409
  );
});

test("syncLoopsContacts returns disabled payload when LOOPS_SECRET_KEY is missing", async () => {
  const prevKey = process.env.LOOPS_SECRET_KEY;
  delete process.env.LOOPS_SECRET_KEY;
  try {
    const pool = { query: async () => ({ rows: [] }) };
    const result = await syncLoopsContacts(pool, { accountScopeId: "scope-1" });
    assert.equal(result.enabled, false);
    assert.equal(result.reason, "LOOPS_SECRET_KEY is not configured");
    assert.equal(result.processed, 0);
  } finally {
    if (prevKey == null) delete process.env.LOOPS_SECRET_KEY;
    else process.env.LOOPS_SECRET_KEY = prevKey;
  }
});

test("syncLoopsContacts returns early when selected project set is empty", async () => {
  const prevKey = process.env.LOOPS_SECRET_KEY;
  process.env.LOOPS_SECRET_KEY = "test-key";
  try {
    const queries = [];
    const pool = {
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };
    const result = await syncLoopsContacts(pool, {
      accountScopeId: "scope-1",
      projectIds: ["proj-1"],
    });
    assert.equal(result.enabled, true);
    assert.deepStrictEqual(result.selected_project_ids, []);
    assert.equal(result.processed, 0);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /FROM projects/);
  } finally {
    if (prevKey == null) delete process.env.LOOPS_SECRET_KEY;
    else process.env.LOOPS_SECRET_KEY = prevKey;
  }
});

test("syncLoopsContacts processes contacts, handles duplicate upsert, and writes scoped audits", async () => {
  const prevKey = process.env.LOOPS_SECRET_KEY;
  const prevBase = process.env.LOOPS_API_BASE_URL;
  const prevFetch = globalThis.fetch;
  process.env.LOOPS_SECRET_KEY = "test-key";
  process.env.LOOPS_API_BASE_URL = "https://loops.example";

  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (fetchCalls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      };
    }
    if (fetchCalls.length === 2) {
      return {
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ message: "already exists" }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    };
  };

  try {
    const auditInserts = [];
    const pool = {
      query: async (sql, params) => {
        if (String(sql).includes("FROM projects")) {
          return { rows: [{ id: "proj-a" }, { id: "proj-b" }] };
        }
        if (String(sql).includes("FROM cw_contacts")) {
          return {
            rows: [
              {
                email: "alice@example.com",
                name: "Alice",
                project_ids: ["proj-a"],
                project_names: ["Project A"],
              },
              {
                email: "invalid-email",
                name: "Invalid",
                project_ids: ["proj-a"],
                project_names: ["Project A"],
              },
              {
                email: "bob@example.com",
                name: "Bob",
                project_ids: ["proj-b"],
                project_names: ["Project B"],
              },
            ],
          };
        }
        if (String(sql).includes("INSERT INTO audit_events")) {
          auditInserts.push(params);
          return { rows: [{ id: `evt-${auditInserts.length}`, created_at: "2026-02-21T00:00:00.000Z" }] };
        }
        throw new Error(`Unexpected SQL in test: ${String(sql).slice(0, 40)}`);
      },
    };

    const result = await syncLoopsContacts(
      pool,
      { accountScopeId: "scope-1", projectIds: ["proj-a", "proj-b"] },
      { actorUsername: "owner", requestId: "req-1", limit: 100 }
    );

    assert.equal(result.enabled, true);
    assert.deepStrictEqual(result.selected_project_ids, ["proj-a", "proj-b"]);
    assert.equal(result.processed, 2);
    assert.equal(result.created, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(fetchCalls.length, 3);
    assert.ok(fetchCalls[0].endsWith("/contacts/create"));
    assert.ok(fetchCalls[1].endsWith("/contacts/create"));
    assert.ok(fetchCalls[2].endsWith("/contacts/update"));
    assert.equal(auditInserts.length, 2, "must write one audit event per selected project");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey == null) delete process.env.LOOPS_SECRET_KEY;
    else process.env.LOOPS_SECRET_KEY = prevKey;
    if (prevBase == null) delete process.env.LOOPS_API_BASE_URL;
    else process.env.LOOPS_API_BASE_URL = prevBase;
  }
});

test("syncLoopsContacts marks audit as partial on mixed success and failure", async () => {
  const prevKey = process.env.LOOPS_SECRET_KEY;
  const prevBase = process.env.LOOPS_API_BASE_URL;
  const prevFetch = globalThis.fetch;
  process.env.LOOPS_SECRET_KEY = "test-key";
  process.env.LOOPS_API_BASE_URL = "https://loops.example";

  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (fetchCalls.length === 1) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }
    return { ok: false, status: 500, text: async () => JSON.stringify({ message: "rate limit" }) };
  };

  try {
    const auditInserts = [];
    const pool = {
      query: async (sql, params) => {
        if (String(sql).includes("FROM projects")) {
          // no projectIds filter passed -> default scope branch
          assert.doesNotMatch(String(sql), /ANY\\(\\$2::text\\[\\]\\)/);
          return { rows: [{ id: "proj-default" }] };
        }
        if (String(sql).includes("FROM cw_contacts")) {
          return {
            rows: [
              { email: "ok@example.com", name: "Ok", project_ids: ["proj-default"], project_names: ["Default"] },
              { email: "fail@example.com", name: "Fail", project_ids: ["proj-default"], project_names: ["Default"] },
            ],
          };
        }
        if (String(sql).includes("INSERT INTO audit_events")) {
          auditInserts.push(params);
          return { rows: [{ id: "evt-1", created_at: "2026-02-21T00:00:00.000Z" }] };
        }
        throw new Error(`Unexpected SQL in test: ${String(sql).slice(0, 40)}`);
      },
    };

    const result = await syncLoopsContacts(
      pool,
      { accountScopeId: "scope-1" },
      { actorUsername: "owner", requestId: "req-mixed", limit: 100 }
    );

    assert.equal(result.processed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.created, 1);
    assert.equal(result.updated, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /loops_http_500/);
    assert.equal(auditInserts.length, 1);
    assert.equal(auditInserts[0][7], "partial");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey == null) delete process.env.LOOPS_SECRET_KEY;
    else process.env.LOOPS_SECRET_KEY = prevKey;
    if (prevBase == null) delete process.env.LOOPS_API_BASE_URL;
    else process.env.LOOPS_API_BASE_URL = prevBase;
  }
});

test("syncLoopsContacts caps stored errors to 20 entries", async () => {
  const prevKey = process.env.LOOPS_SECRET_KEY;
  const prevBase = process.env.LOOPS_API_BASE_URL;
  const prevFetch = globalThis.fetch;
  process.env.LOOPS_SECRET_KEY = "test-key";
  process.env.LOOPS_API_BASE_URL = "https://loops.example";

  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    // Non-JSON body hits readJsonSafe fallback branch.
    text: async () => "gateway-down",
  });

  try {
    const contacts = Array.from({ length: 25 }, (_, idx) => ({
      email: `user${idx}@example.com`,
      name: `User ${idx}`,
      project_ids: ["proj-a"],
      project_names: ["Project A"],
    }));
    const auditInserts = [];

    const pool = {
      query: async (sql, params) => {
        if (String(sql).includes("FROM projects")) {
          return { rows: [{ id: "proj-a" }] };
        }
        if (String(sql).includes("FROM cw_contacts")) {
          return { rows: contacts };
        }
        if (String(sql).includes("INSERT INTO audit_events")) {
          auditInserts.push(params);
          return { rows: [{ id: "evt-cap", created_at: "2026-02-21T00:00:00.000Z" }] };
        }
        throw new Error(`Unexpected SQL in test: ${String(sql).slice(0, 40)}`);
      },
    };

    const result = await syncLoopsContacts(
      pool,
      { accountScopeId: "scope-1", projectIds: ["proj-a"] },
      { actorUsername: "owner", requestId: "req-cap", limit: 9999 }
    );

    assert.equal(result.processed, 0);
    assert.equal(result.failed, 25);
    assert.equal(result.errors.length, 20);
    assert.match(result.errors[0].message, /loops_http_502/);
    assert.equal(auditInserts.length, 1);
    assert.equal(auditInserts[0][7], "failed");
  } finally {
    globalThis.fetch = prevFetch;
    if (prevKey == null) delete process.env.LOOPS_SECRET_KEY;
    else process.env.LOOPS_SECRET_KEY = prevKey;
    if (prevBase == null) delete process.env.LOOPS_API_BASE_URL;
    else process.env.LOOPS_API_BASE_URL = prevBase;
  }
});
