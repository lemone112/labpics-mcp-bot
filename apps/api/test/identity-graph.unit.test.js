import test from "node:test";
import assert from "node:assert/strict";

import {
  applyIdentitySuggestions,
  listIdentityLinks,
  listIdentitySuggestions,
  previewIdentitySuggestions,
} from "../src/domains/identity/identity-graph.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

function makeSuggestionRow(overrides = {}) {
  return {
    id: "sug-1",
    left_entity_type: "cw_contact",
    left_entity_id: "ct-1",
    right_entity_type: "attio_account",
    right_entity_id: "acc-1",
    confidence: 0.95,
    reason: "matching_email_domain",
    status: "proposed",
    evidence_refs: ["ct-1", "acc-1"],
    meta: {},
    created_at: "2026-02-21T00:00:00.000Z",
    updated_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

function makeIdentityLinkRow(overrides = {}) {
  return {
    id: "lnk-1",
    left_entity_type: "cw_contact",
    left_entity_id: "ct-1",
    right_entity_type: "attio_account",
    right_entity_id: "acc-1",
    status: "active",
    source: "suggestion",
    evidence_refs: ["ct-1", "acc-1"],
    created_by: "owner",
    created_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

test("previewIdentitySuggestions builds/stores top suggestions and respects limit", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text.includes("FROM cw_contacts")) {
        return {
          rows: [
            { id: "ct-1", name: "Alice Acme", email: "alice@acme.com" },
            { id: "ct-2", name: "No Match", email: "nomatch@example.org" },
          ],
        };
      }
      if (text.includes("FROM attio_accounts_raw")) {
        return {
          rows: [
            { id: "acc-1", external_id: "a1", name: "Acme", domain: "acme.com" },
            { id: "acc-2", external_id: "a2", name: "Alice Acme", domain: null },
          ],
        };
      }
      if (text.includes("FROM linear_projects_raw")) {
        return {
          rows: [{ id: "lp-1", external_id: "p1", name: "Acme Platform" }],
        };
      }
      if (text.includes("INSERT INTO identity_link_suggestions")) {
        const payload = JSON.parse(params[0]);
        assert.equal(payload.length, 2, "must keep only top-N suggestions");
        // Scores should be sorted desc before trim: 1.0 then 0.95.
        assert.equal(payload[0].confidence, 1);
        assert.equal(payload[1].confidence, 0.95);
        for (const row of payload) {
          assert.match(row.dedupe_key, /^[0-9a-f]{40}$/);
        }
        return { rowCount: payload.length, rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await previewIdentitySuggestions(pool, scope, 2);
  assert.equal(result.generated, 2);
  assert.equal(result.stored, 2);
  assert.equal(result.suggestions.length, 2);
  assert.equal(calls.length, 4);
});

test("previewIdentitySuggestions returns empty when no matches and skips upsert", async () => {
  let inserted = false;
  const pool = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("FROM cw_contacts")) {
        return { rows: [{ id: "ct-1", name: null, email: "bad-email" }] };
      }
      if (text.includes("FROM attio_accounts_raw")) {
        return { rows: [{ id: "acc-1", external_id: "a1", name: "Completely Different", domain: "other.com" }] };
      }
      if (text.includes("FROM linear_projects_raw")) {
        return { rows: [{ id: "lp-1", external_id: "p1", name: "Another Name" }] };
      }
      if (text.includes("INSERT INTO identity_link_suggestions")) {
        inserted = true;
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await previewIdentitySuggestions(pool, scope, "invalid-limit");
  assert.deepStrictEqual(result, { generated: 0, stored: 0, suggestions: [] });
  assert.equal(inserted, false);
});

test("listIdentitySuggestions normalizes status and clamps limit", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [makeSuggestionRow()] };
    },
  };

  await listIdentitySuggestions(pool, scope, { status: "all", limit: "9999" });
  await listIdentitySuggestions(pool, scope, { status: "proposed", limit: "0" });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM identity_link_suggestions/);
  assert.deepStrictEqual(calls[0].params, [
    scope.projectId,
    scope.accountScopeId,
    "",
    200,
  ]);
  assert.equal(calls[1].params[3], 1);
});

test("applyIdentitySuggestions returns early for empty ids and for no selected rows", async () => {
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      return { rows: [] };
    },
  };

  const empty = await applyIdentitySuggestions(pool, scope, [], "owner");
  assert.deepStrictEqual(empty, { applied: 0, links: [] });
  assert.equal(calls, 0);

  const none = await applyIdentitySuggestions(pool, scope, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
  assert.deepStrictEqual(none, { applied: 0, links: [] });
  assert.equal(calls, 1);
});

test("applyIdentitySuggestions inserts links and marks source suggestions as applied", async () => {
  const selected = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      left_entity_type: "cw_contact",
      left_entity_id: "ct-1",
      right_entity_type: "attio_account",
      right_entity_id: "acc-1",
      confidence: 0.95,
      evidence_refs: ["ct-1", "acc-1"],
    },
  ];
  const insertedRows = [makeIdentityLinkRow()];
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (text.includes("FROM identity_link_suggestions") && text.includes("status = 'proposed'")) {
        return { rows: selected };
      }
      if (text.includes("INSERT INTO identity_links")) {
        const payload = JSON.parse(params[0]);
        assert.equal(payload.length, 1);
        assert.equal(payload[0].source, "suggestion");
        assert.equal(payload[0].created_by, "owner");
        return { rowCount: 1, rows: insertedRows };
      }
      if (text.includes("UPDATE identity_link_suggestions")) {
        assert.deepStrictEqual(params, [
          scope.projectId,
          scope.accountScopeId,
          [selected[0].id],
        ]);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 60)}`);
    },
  };

  const result = await applyIdentitySuggestions(pool, scope, [selected[0].id], "owner");
  assert.equal(result.applied, 1);
  assert.deepStrictEqual(result.links, insertedRows);
  assert.equal(calls.length, 3);
});

test("listIdentityLinks normalizes status and clamps limit", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [makeIdentityLinkRow()] };
    },
  };

  await listIdentityLinks(pool, scope, { status: "all", limit: "9999" });
  await listIdentityLinks(pool, scope, { status: "active", limit: "0" });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM identity_links/);
  assert.deepStrictEqual(calls[0].params, [
    scope.projectId,
    scope.accountScopeId,
    "",
    400,
  ]);
  assert.equal(calls[1].params[3], 1);
});
