import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApiKeyAuth } from "../src/infra/api-keys.js";
import { getEffectiveRole } from "../src/infra/rbac.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(currentDir, "..", "src", "index.js"), "utf8");
const apiKeysRouteSource = readFileSync(join(currentDir, "..", "src", "routes", "api-keys.js"), "utf8");

test("getEffectiveRole treats non-admin API key as pm", () => {
  const role = getEffectiveRole({
    apiKey: { id: "k1", scopes: ["read"] },
    auth: {},
  });
  assert.equal(role, "pm");
});

test("getEffectiveRole treats admin API key as owner", () => {
  const role = getEffectiveRole({
    apiKey: { id: "k2", scopes: ["read", "admin"] },
    auth: {},
  });
  assert.equal(role, "owner");
});

test("createApiKeyAuth normalizes scopes and derives role", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          rows: [{
            id: "key-1",
            project_id: "00000000-0000-4000-8000-000000000001",
            account_scope_id: "00000000-0000-4000-8000-000000000002",
            name: "ci",
            scopes: ["WRITE", " admin ", "invalid"],
            expires_at: null,
          }],
        };
      }
      return { rows: [] };
    },
  };

  const handler = createApiKeyAuth(pool, { warn() {} });
  const request = { headers: { "x-api-key": "raw-key" } };
  await handler(request);

  assert.deepEqual(request.apiKey.scopes, ["write", "admin"]);
  assert.equal(request.auth.user_role, "owner");
});

test("index onRequest no longer short-circuits API key auth path", () => {
  assert.ok(
    !indexSource.includes("if (request.auth) return; // successfully authenticated via API key"),
    "API key branch must not short-circuit before scope checks"
  );
  assert.ok(
    indexSource.includes("if (!request.auth || !request.apiKey)"),
    "API key branch must enforce authenticated key object"
  );
  assert.ok(
    indexSource.includes("scope_insufficient"),
    "API key mutating requests must enforce write/admin scopes"
  );
});

test("api key management routes require owner session (not API key)", () => {
  assert.ok(
    apiKeysRouteSource.includes("Only owner session can manage API keys"),
    "Routes must enforce owner-session guard for api key management"
  );
  assert.ok(
    apiKeysRouteSource.includes("request.apiKey"),
    "Guard must reject management calls authenticated by API key"
  );
});
