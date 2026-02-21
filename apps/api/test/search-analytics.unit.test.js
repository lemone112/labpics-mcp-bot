import test from "node:test";
import assert from "node:assert/strict";

import { getSearchAnalyticsSummary, trackSearchEvent } from "../src/domains/rag/search-analytics.js";

test("trackSearchEvent skips writes when project scope is missing", async () => {
  const calls = [];
  const pool = {
    query: async (...args) => {
      calls.push(args);
      return { rows: [] };
    },
  };
  const warnings = [];
  const logger = {
    warn: (payload, msg) => warnings.push({ payload, msg }),
  };

  const result = await trackSearchEvent(pool, { projectId: null, accountScopeId: null }, { query: "q" }, logger);

  assert.equal(result, null);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].msg, "skipping search analytics event due to missing scope");
});

test("trackSearchEvent writes scoped analytics payload", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: "evt-1" }] };
    },
  };

  const result = await trackSearchEvent(
    pool,
    { projectId: "p-1", accountScopeId: "s-1" },
    {
      query: "  hello world  ",
      resultCount: 7,
      filters: { sourceFilter: ["messages"] },
      eventType: "search",
      durationMs: 124.6,
      clickedResultId: "id-1",
      clickedSourceType: "chatwoot_message",
      userId: "u-1",
    }
  );

  assert.equal(result, "evt-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params[0], "hello world");
  assert.equal(calls[0].params[1], 7);
  assert.equal(calls[0].params[2], JSON.stringify({ sourceFilter: ["messages"] }));
  assert.equal(calls[0].params[3], "u-1");
  assert.equal(calls[0].params[4], "p-1");
  assert.equal(calls[0].params[5], "s-1");
  assert.equal(calls[0].params[6], "id-1");
  assert.equal(calls[0].params[7], "chatwoot_message");
  assert.equal(calls[0].params[8], "search");
  assert.equal(calls[0].params[9], 125);
});

test("getSearchAnalyticsSummary clamps bounds and returns normalized response", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rows: [
            {
              total_searches: 10,
              total_clicks: 4,
              unique_queries: 3,
              unique_users: 2,
              avg_duration_ms: 111,
              avg_result_count: 8,
            },
          ],
        };
      }
      if (calls.length === 2) {
        return { rows: [{ query: "deal", search_count: 3, avg_results: 9, avg_duration_ms: 120 }] };
      }
      if (calls.length === 3) {
        return { rows: [{ day: "2026-02-20", searches: 5, clicks: 2 }] };
      }
      if (calls.length === 4) {
        return { rows: [{ total_query_types: 5, clicked_query_types: 2 }] };
      }
      return { rows: [{ source_type: "chatwoot_message", click_count: 2 }] };
    },
  };

  const summary = await getSearchAnalyticsSummary(
    pool,
    { projectId: "p-1", accountScopeId: "s-1" },
    { days: 9999, topQueriesLimit: 9999 }
  );

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.params[0], "p-1");
    assert.equal(call.params[1], "s-1");
    assert.equal(call.params[2], 365);
  }
  assert.equal(calls[1].params[3], 100);

  assert.equal(summary.period_days, 365);
  assert.equal(summary.overview.total_searches, 10);
  assert.equal(summary.overview.total_clicks, 4);
  assert.equal(summary.overview.click_through_rate_pct, 40);
  assert.equal(summary.top_queries.length, 1);
  assert.equal(summary.daily_volume.length, 1);
  assert.equal(summary.source_clicks.length, 1);
});
