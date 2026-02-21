import test from "node:test";
import assert from "node:assert/strict";

import {
  listUpsellRadar,
  refreshUpsellRadar,
  updateUpsellStatus,
} from "../src/domains/analytics/upsell.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

function makeUpsellRow(overrides = {}) {
  return {
    id: "up-1",
    account_external_id: "acc-1",
    source_ref: "src-1",
    title: "Expansion",
    rationale: "signal",
    score: 0.72,
    status: "proposed",
    suggested_offer_payload: { template: "expansion_offer_v1" },
    suggested_outbound_payload: { channel: "email" },
    evidence_refs: ["e-1"],
    created_at: "2026-02-21T00:00:00.000Z",
    updated_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

test("refreshUpsellRadar collects message/opportunity candidates and upserts them", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text.includes("FROM cw_messages")) {
        return {
          rows: [
            {
              id: "msg-1",
              conversation_global_id: "conv-1",
              content: "Could we upgrade this package next month?",
            },
            {
              id: "msg-2",
              conversation_global_id: "conv-2",
              content: "Thank you for the update",
            },
            {
              id: "msg-3",
              conversation_global_id: null,
              content: null,
            },
          ],
        };
      }
      if (text.includes("FROM attio_opportunities_raw")) {
        return {
          rows: [
            {
              id: "opp-1",
              account_external_id: "acc-enterprise",
              title: "Roadmap Expansion",
              stage: "Qualified",
              amount: 26000,
            },
            {
              id: "opp-2",
              account_external_id: "acc-won",
              title: "Already Closed",
              stage: "won",
              amount: 50000,
            },
            {
              id: "opp-3",
              account_external_id: "acc-no-title",
              title: null,
              stage: "proposal",
              amount: 7000,
            },
          ],
        };
      }
      if (text.includes("INSERT INTO upsell_opportunities")) {
        const payload = JSON.parse(params[0]);
        assert.equal(payload.length, 2);
        const fromMessage = payload.find((x) => x.source_ref === "msg-1");
        const fromOpportunity = payload.find((x) => x.source_ref === "opp-1");
        assert.ok(fromMessage);
        assert.ok(fromOpportunity);
        assert.equal(fromMessage.score, 0.72);
        assert.deepStrictEqual(fromMessage.evidence_refs, ["msg-1", "conv-1"]);
        assert.equal(fromOpportunity.score, 0.85);
        assert.equal(fromOpportunity.account_external_id, "acc-enterprise");
        assert.match(fromMessage.dedupe_key, /^[0-9a-f]{40}$/);
        assert.match(fromOpportunity.dedupe_key, /^[0-9a-f]{40}$/);
        return { rowCount: 2, rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await refreshUpsellRadar(pool, scope);
  assert.deepStrictEqual(result, { generated_candidates: 2, touched: 2 });
  assert.equal(calls.length, 3);
});

test("refreshUpsellRadar returns zero touched when no candidates detected", async () => {
  let insertCalled = false;
  const pool = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("FROM cw_messages")) {
        return { rows: [{ id: "m-1", conversation_global_id: "c-1", content: "plain status update" }] };
      }
      if (text.includes("FROM attio_opportunities_raw")) {
        return { rows: [{ id: "o-1", account_external_id: null, title: "Closed", stage: "lost", amount: 4000 }] };
      }
      if (text.includes("INSERT INTO upsell_opportunities")) {
        insertCalled = true;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await refreshUpsellRadar(pool, scope);
  assert.deepStrictEqual(result, { generated_candidates: 0, touched: 0 });
  assert.equal(insertCalled, false);
});

test("listUpsellRadar normalizes status and clamps/parses limits", async () => {
  const calls = [];
  const rows = [makeUpsellRow()];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows };
    },
  };

  await listUpsellRadar(pool, scope, { status: " proposed ", limit: "9999" });
  await listUpsellRadar(pool, scope, { status: "", limit: "0" });
  await listUpsellRadar(pool, scope, { limit: "not-a-number" });

  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /FROM upsell_opportunities/);
  assert.deepStrictEqual(calls[0].params, [
    scope.projectId,
    scope.accountScopeId,
    "proposed",
    400,
  ]);
  assert.equal(calls[1].params[3], 1);
  assert.equal(calls[2].params[3], 100);
});

test("updateUpsellStatus rejects invalid status before hitting DB", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };

  await assert.rejects(
    () => updateUpsellStatus(pool, scope, "up-1", "INVALID"),
    /invalid_upsell_status/
  );
  assert.equal(called, false);
});

test("updateUpsellStatus normalizes valid status and returns row or null", async () => {
  const updated = makeUpsellRow({ id: "up-2", status: "accepted" });
  let calls = 0;
  const pool = {
    query: async (sql, params) => {
      calls += 1;
      assert.match(String(sql), /UPDATE upsell_opportunities/);
      if (calls === 1) {
        assert.deepStrictEqual(params, [
          "up-2",
          scope.projectId,
          scope.accountScopeId,
          "accepted",
        ]);
        return { rows: [updated] };
      }
      return { rows: [] };
    },
  };

  const first = await updateUpsellStatus(pool, scope, "up-2", "  ACCEPTED ");
  assert.deepStrictEqual(first, updated);
  const second = await updateUpsellStatus(pool, scope, "up-missing", "dismissed");
  assert.equal(second, null);
});
