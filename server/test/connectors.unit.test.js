import test from "node:test";
import assert from "node:assert/strict";

import {
  createConnector,
  createComposioMcpRunner,
} from "../src/connectors/index.js";

// ---------------------------------------------------------------------------
// createConnector — validation
// ---------------------------------------------------------------------------

test("createConnector throws on empty name", () => {
  assert.throws(() => createConnector({ name: "", mode: "http" }), {
    message: "connector_name_required",
  });
});

test("createConnector throws on whitespace-only name", () => {
  assert.throws(() => createConnector({ name: "   ", mode: "http" }), {
    message: "connector_name_required",
  });
});

test("createConnector throws on invalid mode", () => {
  assert.throws(() => createConnector({ name: "test", mode: "grpc" }), {
    message: "connector_mode_invalid",
  });
});

// ---------------------------------------------------------------------------
// createConnector — name normalization
// ---------------------------------------------------------------------------

test("createConnector normalizes name to lowercase trimmed", () => {
  const c = createConnector({ name: "  Chatwoot  ", mode: "http", httpRunner: async () => ({}) });
  assert.equal(c.name, "chatwoot");
  assert.equal(c.mode, "http");
});

// ---------------------------------------------------------------------------
// createConnector — HTTP mode
// ---------------------------------------------------------------------------

test("createConnector HTTP mode calls httpRunner", async () => {
  let called = false;
  const c = createConnector({
    name: "chatwoot",
    mode: "http",
    httpRunner: async (ctx) => {
      called = true;
      return { synced: true, context: ctx };
    },
  });
  const result = await c.pull({ pool: null });
  assert.ok(called);
  assert.equal(result.synced, true);
});

test("createConnector HTTP mode throws when httpRunner is missing", async () => {
  const c = createConnector({ name: "chatwoot", mode: "http" });
  await assert.rejects(() => c.pull({}), {
    message: "chatwoot_http_not_configured",
  });
});

// ---------------------------------------------------------------------------
// createConnector — MCP mode
// ---------------------------------------------------------------------------

test("createConnector MCP mode calls mcpRunner", async () => {
  let called = false;
  const c = createConnector({
    name: "linear",
    mode: "mcp",
    mcpRunner: async (ctx) => {
      called = true;
      return { synced: true };
    },
  });
  const result = await c.pull({ pool: null });
  assert.ok(called);
  assert.equal(result.synced, true);
});

test("createConnector MCP mode throws when mcpRunner is missing", async () => {
  const c = createConnector({ name: "linear", mode: "mcp" });
  await assert.rejects(() => c.pull({}), {
    message: "linear_mcp_not_configured",
  });
});

// ---------------------------------------------------------------------------
// createComposioMcpRunner
// ---------------------------------------------------------------------------

test("createComposioMcpRunner delegates to invoke with correct contract", async () => {
  let invokeArgs = null;
  const runner = createComposioMcpRunner({
    connector: "attio",
    invoke: async (args) => {
      invokeArgs = args;
      return { ok: true };
    },
  });
  const ctx = { pool: "pool", scope: "scope", logger: "logger" };
  const result = await runner(ctx);

  assert.equal(result.ok, true);
  assert.equal(invokeArgs.connector, "attio");
  assert.equal(invokeArgs.operation, "sync");
  assert.equal(invokeArgs.context, ctx);
});

test("createComposioMcpRunner without invoke returns throwing runner", async () => {
  const runner = createComposioMcpRunner({ connector: "chatwoot" });
  await assert.rejects(() => runner({}), {
    message: "chatwoot_mcp_not_configured",
  });
});

test("createComposioMcpRunner with non-function invoke returns throwing runner", async () => {
  const runner = createComposioMcpRunner({ connector: "linear", invoke: "not_a_function" });
  await assert.rejects(() => runner({}), {
    message: "linear_mcp_not_configured",
  });
});
