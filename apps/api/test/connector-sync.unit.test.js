import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONNECTORS,
  connectorMode,
  getHttpRunner,
  listConnectorErrors,
  listConnectorSyncState,
  normalizeInt,
  normalizeStatusFilter,
  retryConnectorErrors,
  runConnectorSync,
} from "../src/domains/connectors/connector-sync.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

describe("connector-sync helpers", () => {
  it("CONNECTORS contains supported connector ids", () => {
    assert.deepStrictEqual(CONNECTORS, ["chatwoot", "linear", "attio"]);
  });

  it("normalizeInt clamps bounds and uses fallback", () => {
    assert.equal(normalizeInt("50", 10, 1, 100), 50);
    assert.equal(normalizeInt("500", 10, 1, 100), 100);
    assert.equal(normalizeInt("-10", 10, 1, 100), 1);
    assert.equal(normalizeInt("bad", 10, 1, 100), 10);
  });

  it("normalizeStatusFilter trims and lowercases values", () => {
    assert.equal(normalizeStatusFilter(" FAILED "), "failed");
    assert.equal(normalizeStatusFilter(null), "");
  });

  it("connectorMode prioritizes specific env, then common, then default", () => {
    const prevSpecific = process.env.CONNECTOR_CHATWOOT_MODE;
    const prevCommon = process.env.CONNECTOR_MODE;
    try {
      process.env.CONNECTOR_CHATWOOT_MODE = "MCP";
      process.env.CONNECTOR_MODE = "http";
      assert.equal(connectorMode("chatwoot"), "mcp");

      delete process.env.CONNECTOR_CHATWOOT_MODE;
      process.env.CONNECTOR_MODE = "MCP";
      assert.equal(connectorMode("chatwoot"), "mcp");

      delete process.env.CONNECTOR_MODE;
      assert.equal(connectorMode("chatwoot"), "http");
    } finally {
      if (prevSpecific == null) delete process.env.CONNECTOR_CHATWOOT_MODE;
      else process.env.CONNECTOR_CHATWOOT_MODE = prevSpecific;
      if (prevCommon == null) delete process.env.CONNECTOR_MODE;
      else process.env.CONNECTOR_MODE = prevCommon;
    }
  });

  it("getHttpRunner returns functions for supported connectors", () => {
    assert.equal(typeof getHttpRunner("chatwoot"), "function");
    assert.equal(typeof getHttpRunner("linear"), "function");
    assert.equal(typeof getHttpRunner("attio"), "function");
    assert.equal(getHttpRunner("unknown"), null);
  });
});

describe("connector-sync query functions", () => {
  it("listConnectorSyncState returns rows from connector_sync_state", async () => {
    const pool = {
      query: async (sql, params) => {
        assert.match(String(sql), /FROM connector_sync_state/);
        assert.deepStrictEqual(params, [scope.projectId, scope.accountScopeId]);
        return { rows: [{ connector: "chatwoot", status: "ok" }] };
      },
    };

    const rows = await listConnectorSyncState(pool, scope);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].connector, "chatwoot");
  });

  it("listConnectorErrors normalizes status and limit", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };

    await listConnectorErrors(pool, scope, { status: " FAILED ", limit: "9999" });
    await listConnectorErrors(pool, scope, { status: null, limit: "bad" });

    assert.deepStrictEqual(calls[0], [scope.projectId, scope.accountScopeId, "failed", 500]);
    assert.deepStrictEqual(calls[1], [scope.projectId, scope.accountScopeId, "", 100]);
  });
});

describe("connector-sync execution boundaries", () => {
  it("runConnectorSync rejects unsupported connector before state updates", async () => {
    const pool = {
      query: async () => {
        throw new Error("unexpected query");
      },
    };

    await assert.rejects(
      () => runConnectorSync(pool, scope, "unknown", {}),
      { message: "unsupported_connector" }
    );
  });

  it("retryConnectorErrors handles empty due list and clamps retry limit", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        const text = String(sql);
        calls.push({ text, params });
        if (text.includes("INSERT INTO connector_events")) {
          return { rows: [] };
        }
        if (text.includes("FROM connector_errors") && text.includes("next_retry_at <= now()")) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 80)}`);
      },
    };

    const result = await retryConnectorErrors(pool, scope, { limit: "9999", logger: {} });

    assert.equal(result.due, 0);
    assert.equal(result.succeeded, 0);
    assert.equal(result.failed, 0);
    assert.deepStrictEqual(result.retried, []);

    const dueCall = calls.find((call) => call.text.includes("next_retry_at <= now()"));
    assert.ok(dueCall, "expected due-errors query call");
    assert.deepStrictEqual(dueCall.params, [scope.projectId, scope.accountScopeId, 200]);
  });
});
