import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addSeconds,
  clampInt,
  dedupeKeyForError,
  listDeadLetterErrors,
  listDueConnectorErrors,
  markConnectorSyncFailure,
  markConnectorSyncRunning,
  markConnectorSyncSuccess,
  nextBackoffSeconds,
  registerConnectorError,
  resolveConnectorErrorById,
  resolveConnectorErrors,
  retryDeadLetterError,
} from "../src/domains/connectors/connector-state.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

describe("nextBackoffSeconds", () => {
  it("returns base seconds for attempt 1", () => {
    assert.equal(nextBackoffSeconds(1, 30), 30);
  });

  it("doubles for each subsequent attempt", () => {
    assert.equal(nextBackoffSeconds(2, 30), 60);
    assert.equal(nextBackoffSeconds(3, 30), 120);
    assert.equal(nextBackoffSeconds(4, 30), 240);
  });

  it("caps at maximum", () => {
    const cap = 6 * 60 * 60; // 21600
    const result = nextBackoffSeconds(20, 30, cap);
    assert.equal(result, cap);
  });

  it("handles attempt 0 same as attempt 1", () => {
    // power = max(0, min(10, -1)) = 0, so 30 * 2^0 = 30
    assert.equal(nextBackoffSeconds(0, 30), 30);
  });

  it("handles custom base seconds", () => {
    assert.equal(nextBackoffSeconds(1, 60), 60);
    assert.equal(nextBackoffSeconds(2, 60), 120);
  });

  it("clamps power to max 10", () => {
    // attempt 12: power = min(10, 11) = 10 => 30 * 1024 = 30720
    const result = nextBackoffSeconds(12, 30, 100000);
    assert.equal(result, 30 * Math.pow(2, 10));
  });

  it("real-world progression: 30s base, 5 retries", () => {
    const progression = [1, 2, 3, 4, 5].map((a) => nextBackoffSeconds(a, 30));
    assert.deepStrictEqual(progression, [30, 60, 120, 240, 480]);
  });
});

describe("dedupeKeyForError", () => {
  it("generates consistent sha1 hash", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    const key2 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    assert.equal(key1, key2);
    assert.equal(key1.length, 40); // sha1 hex
  });

  it("produces different keys for different inputs", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    const key2 = dedupeKeyForError({
      connector: "linear",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    assert.notEqual(key1, key2);
  });

  it("handles missing sourceRef and errorKind", () => {
    const key = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: undefined,
      errorKind: undefined,
    });
    assert.equal(key.length, 40);
  });

  it("different modes produce different keys", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
    });
    const key2 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "mcp",
      operation: "sync",
    });
    assert.notEqual(key1, key2);
  });
});

describe("addSeconds", () => {
  it("adds seconds to a date", () => {
    const base = new Date("2024-01-01T00:00:00Z");
    const result = addSeconds(base, 60);
    assert.equal(result.toISOString(), "2024-01-01T00:01:00.000Z");
  });

  it("handles negative seconds", () => {
    const base = new Date("2024-01-01T00:01:00Z");
    const result = addSeconds(base, -60);
    assert.equal(result.toISOString(), "2024-01-01T00:00:00.000Z");
  });

  it("handles large values", () => {
    const base = new Date("2024-01-01T00:00:00Z");
    const result = addSeconds(base, 86400); // 24 hours
    assert.equal(result.toISOString(), "2024-01-02T00:00:00.000Z");
  });
});

describe("clampInt (connector-state)", () => {
  it("parses and clamps integer", () => {
    assert.equal(clampInt("50", 0, 0, 100), 50);
  });

  it("returns fallback for non-numeric", () => {
    assert.equal(clampInt("abc", 5), 5);
    assert.equal(clampInt(null, 5), 5);
  });

  it("clamps to bounds", () => {
    assert.equal(clampInt("200", 5, 0, 100), 100);
    assert.equal(clampInt("-10", 5, 0, 100), 0);
  });
});

describe("registerConnectorError", () => {
  it("inserts a pending error row on first attempt", async () => {
    const prevMax = process.env.CONNECTOR_MAX_RETRIES;
    const prevBase = process.env.CONNECTOR_RETRY_BASE_SECONDS;
    process.env.CONNECTOR_MAX_RETRIES = "5";
    process.env.CONNECTOR_RETRY_BASE_SECONDS = "30";
    try {
      const calls = [];
      const pool = {
        query: async (sql, params) => {
          const text = String(sql);
          calls.push({ sql: text, params });
          if (text.includes("FROM connector_errors")) {
            return { rows: [] };
          }
          if (text.includes("INSERT INTO connector_errors")) {
            assert.equal(params[2], "chatwoot");
            assert.equal(params[3], "http");
            assert.equal(params[4], "sync");
            assert.equal(params[12], "custom-dedupe");
            return { rows: [{ id: "err-1" }] };
          }
          throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
        },
      };

      const before = Date.now();
      const result = await registerConnectorError(pool, scope, {
        connector: " Chatwoot ",
        mode: "HTTP",
        operation: "sync",
        error_message: "timeout",
        dedupe_key: " custom-dedupe ",
      });
      const retryAt = Date.parse(result.next_retry_at);

      assert.equal(result.id, "err-1");
      assert.equal(result.attempt, 1);
      assert.equal(result.status, "pending");
      assert.ok(retryAt >= before + 25_000);
      assert.ok(calls.length >= 2);
      assert.equal(calls[0].params[3], "custom-dedupe");
    } finally {
      if (prevMax == null) delete process.env.CONNECTOR_MAX_RETRIES;
      else process.env.CONNECTOR_MAX_RETRIES = prevMax;
      if (prevBase == null) delete process.env.CONNECTOR_RETRY_BASE_SECONDS;
      else process.env.CONNECTOR_RETRY_BASE_SECONDS = prevBase;
    }
  });

  it("updates existing row and transitions to dead_letter at max attempts", async () => {
    const prevMax = process.env.CONNECTOR_MAX_RETRIES;
    const prevBase = process.env.CONNECTOR_RETRY_BASE_SECONDS;
    process.env.CONNECTOR_MAX_RETRIES = "2";
    process.env.CONNECTOR_RETRY_BASE_SECONDS = "30";
    try {
      let updateParams = null;
      const pool = {
        query: async (sql, params) => {
          const text = String(sql);
          if (text.includes("FROM connector_errors")) {
            return { rows: [{ id: "err-existing", attempt: 1 }] };
          }
          if (text.includes("UPDATE connector_errors")) {
            updateParams = params;
            return { rows: [] };
          }
          throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
        },
      };

      const result = await registerConnectorError(pool, scope, {
        connector: "linear",
        mode: "http",
        operation: "sync",
        source_ref: "lin-1",
        error_kind: "sync_failed",
        error_message: "boom",
      });

      assert.equal(result.id, "err-existing");
      assert.equal(result.attempt, 2);
      assert.equal(result.status, "dead_letter");
      assert.equal(updateParams[10], 2);
      assert.equal(updateParams[12], "dead_letter");
    } finally {
      if (prevMax == null) delete process.env.CONNECTOR_MAX_RETRIES;
      else process.env.CONNECTOR_MAX_RETRIES = prevMax;
      if (prevBase == null) delete process.env.CONNECTOR_RETRY_BASE_SECONDS;
      else process.env.CONNECTOR_RETRY_BASE_SECONDS = prevBase;
    }
  });
});

describe("connector error helpers", () => {
  it("resolveConnectorErrors returns affected row count", async () => {
    const pool = {
      query: async (sql, params) => {
        assert.match(String(sql), /UPDATE connector_errors/);
        assert.deepStrictEqual(params, [scope.projectId, scope.accountScopeId, "chatwoot"]);
        return { rowCount: 3 };
      },
    };
    const count = await resolveConnectorErrors(pool, scope, "chatwoot");
    assert.equal(count, 3);
  });

  it("listDueConnectorErrors and listDeadLetterErrors clamp limits", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };

    await listDueConnectorErrors(pool, scope, 9999);
    await listDueConnectorErrors(pool, scope, "bad");
    await listDeadLetterErrors(pool, scope, 9999);
    await listDeadLetterErrors(pool, scope, "bad");

    assert.deepStrictEqual(calls[0], [scope.projectId, scope.accountScopeId, 500]);
    assert.deepStrictEqual(calls[1], [scope.projectId, scope.accountScopeId, 20]);
    assert.deepStrictEqual(calls[2], [scope.projectId, scope.accountScopeId, 500]);
    assert.deepStrictEqual(calls[3], [scope.projectId, scope.accountScopeId, 50]);
  });

  it("retryDeadLetterError and resolveConnectorErrorById return row identifiers or null", async () => {
    let step = 0;
    const pool = {
      query: async (_sql) => {
        step += 1;
        if (step === 1) return { rows: [{ id: "err-1", status: "pending" }] };
        if (step === 2) return { rows: [] };
        if (step === 3) return { rows: [{ id: "err-2" }] };
        return { rows: [] };
      },
    };

    const retried = await retryDeadLetterError(pool, scope, "err-1");
    assert.equal(retried.id, "err-1");
    const missingRetry = await retryDeadLetterError(pool, scope, "err-missing");
    assert.equal(missingRetry, null);
    const resolved = await resolveConnectorErrorById(pool, scope, "err-2");
    assert.equal(resolved, "err-2");
    const missingResolved = await resolveConnectorErrorById(pool, scope, "err-x");
    assert.equal(missingResolved, null);
  });
});

describe("connector sync state updates", () => {
  it("markConnectorSyncRunning/Failure/Success issue expected parameters", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params });
        return { rows: [] };
      },
    };

    await markConnectorSyncRunning(pool, scope, "chatwoot", "http", { retry_count: "7" });
    await markConnectorSyncFailure(pool, scope, "chatwoot", "http", "sync failed", {
      retry_count: "7",
    });
    await markConnectorSyncSuccess(pool, scope, "chatwoot", "http", {
      cursor_ts: "2026-01-01T00:00:00.000Z",
      cursor_id: "cursor-1",
      page_cursor: "p-1",
      meta: { synced: true },
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].params[4], 7);
    assert.equal(calls[1].params[4], 8);
    assert.equal(calls[1].params[5], "sync failed");
    assert.equal(calls[2].params[4], "2026-01-01T00:00:00.000Z");
    assert.equal(calls[2].params[5], "cursor-1");
    assert.equal(calls[2].params[6], "p-1");
    assert.equal(calls[2].params[7], JSON.stringify({ synced: true }));
  });
});
