import test from "node:test";
import assert from "node:assert/strict";

import {
  applyContinuityActions,
  buildContinuityPreview,
  listContinuityActions,
} from "../src/domains/outbound/continuity.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

function makeContinuityAction(overrides = {}) {
  return {
    id: "act-1",
    source_type: "attio",
    source_ref: "opp-1",
    title: "Deal continuity: Big Deal",
    description: "Call next week",
    preview_payload: { suggested_linear_title: "Follow-up: Big Deal" },
    linear_issue_external_id: null,
    status: "previewed",
    evidence_refs: ["opp-1"],
    created_by: "owner",
    created_at: "2026-02-21T00:00:00.000Z",
    updated_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

test("buildContinuityPreview creates candidates from opportunities and messages", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text.includes("FROM crm_opportunities")) {
        return {
          rows: [
            {
              id: "opp-1",
              title: "Big Deal",
              next_step: "Call next week with updated scope",
              expected_close_date: "2026-03-01",
            },
            {
              id: "opp-2",
              title: "Too short",
              next_step: "call",
              expected_close_date: null,
            },
          ],
        };
      }
      if (text.includes("FROM cw_messages")) {
        return {
          rows: [
            {
              id: "msg-1",
              conversation_global_id: "conv-1",
              content: "We will send details by Friday once approved",
            },
            {
              id: "msg-2",
              conversation_global_id: "conv-2",
              content: "FYI status update only",
            },
          ],
        };
      }
      if (text.includes("INSERT INTO continuity_actions")) {
        const payload = JSON.parse(params[0]);
        assert.equal(payload.length, 2);
        const fromOpp = payload.find((x) => x.source_ref === "opp-1");
        const fromMessage = payload.find((x) => x.source_ref === "msg-1");
        assert.ok(fromOpp);
        assert.ok(fromMessage);
        assert.equal(fromOpp.source_type, "attio");
        assert.equal(fromMessage.source_type, "chatwoot");
        assert.match(fromOpp.dedupe_key, /^[0-9a-f]{40}$/);
        assert.match(fromMessage.dedupe_key, /^[0-9a-f]{40}$/);
        return {
          rowCount: 2,
          rows: [
            makeContinuityAction({ id: "act-opp", source_ref: "opp-1" }),
            makeContinuityAction({
              id: "act-msg",
              source_type: "chatwoot",
              source_ref: "msg-1",
              title: "Message commitment follow-up",
            }),
          ],
        };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await buildContinuityPreview(pool, scope, "owner");
  assert.equal(result.touched, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(calls.length, 3);
});

test("buildContinuityPreview skips upsert when no continuity candidates", async () => {
  let insertCalled = false;
  const pool = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("FROM crm_opportunities")) {
        return { rows: [{ id: "opp-1", title: "Deal", next_step: "x", expected_close_date: null }] };
      }
      if (text.includes("FROM cw_messages")) {
        return { rows: [{ id: "msg-1", conversation_global_id: null, content: "Routine update" }] };
      }
      if (text.includes("INSERT INTO continuity_actions")) {
        insertCalled = true;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await buildContinuityPreview(pool, scope);
  assert.deepStrictEqual(result, { touched: 0, rows: [] });
  assert.equal(insertCalled, false);
});

test("listContinuityActions trims status and clamps/parses limits", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [makeContinuityAction()] };
    },
  };

  await listContinuityActions(pool, scope, { status: " applied ", limit: "9999" });
  await listContinuityActions(pool, scope, { status: "", limit: "0" });
  await listContinuityActions(pool, scope, { limit: "invalid" });

  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FROM continuity_actions/);
  assert.deepStrictEqual(calls[0].params, [
    scope.projectId,
    scope.accountScopeId,
    "applied",
    400,
  ]);
  assert.equal(calls[1].params[3], 1);
  assert.equal(calls[2].params[3], 100);
});

test("applyContinuityActions returns early for empty ids and for no selected rows", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      return { rows: [] };
    },
  };

  const empty = await applyContinuityActions(pool, scope, [], "owner");
  assert.deepStrictEqual(empty, { applied: 0, actions: [] });
  assert.equal(calls, 0);

  const noneSelected = await applyContinuityActions(pool, scope, ["11111111-1111-4111-8111-111111111111"], "owner");
  assert.deepStrictEqual(noneSelected, { applied: 0, actions: [] });
  assert.equal(calls, 1);
});

test("applyContinuityActions creates linear issue, updates status, and filters returned actions", async () => {
  const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text.includes("FROM continuity_actions") && text.includes("id = ANY")) {
        return {
          rows: [
            {
              id: actionId,
              title: "Follow-up action",
              description: "Ping customer",
              preview_payload: null,
              status: "previewed",
            },
          ],
        };
      }
      if (text.includes("FROM linear_projects_raw")) {
        // No linked project -> fallback branch.
        return { rows: [] };
      }
      if (text.includes("INSERT INTO linear_issues_raw")) {
        assert.equal(params[0], `linissue:${scope.projectId}:continuity:${actionId}`);
        assert.equal(params[4], "continuity-fallback");
        assert.equal(params[5], "Follow-up action");
        return { rows: [] };
      }
      if (text.includes("UPDATE continuity_actions")) {
        assert.deepStrictEqual(params, [
          actionId,
          scope.projectId,
          scope.accountScopeId,
          `continuity:${actionId}`,
          "owner",
        ]);
        return { rows: [] };
      }
      if (
        text.includes("FROM continuity_actions") &&
        text.includes("AND ($3 = '' OR status = $3)")
      ) {
        return {
          rows: [
            makeContinuityAction({
              id: actionId,
              status: "applied",
              linear_issue_external_id: `continuity:${actionId}`,
            }),
            makeContinuityAction({
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              status: "applied",
            }),
          ],
        };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await applyContinuityActions(pool, scope, [actionId], "owner");
  assert.equal(result.applied, 1);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].id, actionId);
  assert.ok(calls.length >= 5);
});
