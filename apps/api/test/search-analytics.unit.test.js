import test from "node:test";
import assert from "node:assert/strict";

import { getSearchSuggestions } from "../src/domains/rag/search-analytics.js";

test("getSearchSuggestions returns mapped rows", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rows: [
          { query: "дедлайн релиза", search_count: 4 },
          { query: "бюджет", search_count: 2 },
        ],
      };
    },
  };

  const scope = { projectId: "p1", accountScopeId: "a1" };
  const result = await getSearchSuggestions(pool, scope, { query: "дед", limit: 5, days: 14 });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { query: "дедлайн релиза", search_count: 4 });
  assert.deepEqual(result[1], { query: "бюджет", search_count: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], "p1");
  assert.equal(calls[0].params[1], "a1");
  assert.equal(calls[0].params[2], 14);
  assert.equal(calls[0].params[3], "%дед%");
  assert.equal(calls[0].params[4], 5);
});

test("getSearchSuggestions clamps invalid options", async () => {
  const pool = {
    async query(_sql, params) {
      return { rows: [], _params: params };
    },
  };

  const scope = { projectId: "p1", accountScopeId: "a1" };
  await getSearchSuggestions(pool, scope, { query: "", limit: 0, days: 9999 });

  // Re-run to capture params deterministically
  let observed = null;
  const pool2 = {
    async query(_sql, params) {
      observed = params;
      return { rows: [] };
    },
  };
  await getSearchSuggestions(pool2, scope, { query: "", limit: 0, days: 9999 });
  assert.equal(observed[2], 365);
  assert.equal(observed[3], null);
  assert.equal(observed[4], 8);
});
