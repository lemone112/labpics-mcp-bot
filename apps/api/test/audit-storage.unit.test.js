import test from "node:test";
import assert from "node:assert/strict";

import { indexEvidenceRefs, listAuditEvents, writeAuditEvent } from "../src/domains/core/audit.js";

test("indexEvidenceRefs returns 0 for empty refs or missing scope", async () => {
  const pool = {
    query: async () => {
      throw new Error("query must not be called");
    },
  };

  const a = await indexEvidenceRefs(pool, { projectId: "p", accountScopeId: "s" }, []);
  assert.equal(a, 0);

  const b = await indexEvidenceRefs(pool, { projectId: null, accountScopeId: "s" }, [{ source: "x", ref: "y", snippet: null, meta: {} }]);
  assert.equal(b, 0);
});

test("writeAuditEvent inserts audit row and indexes evidence refs", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return { rows: [{ id: "evt-1", created_at: "2026-02-21T00:00:00.000Z" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 2 };
    },
  };

  const result = await writeAuditEvent(pool, {
    projectId: "00000000-0000-4000-8000-000000000001",
    accountScopeId: "00000000-0000-4000-8000-000000000011",
    action: "user.login",
    entityType: "session",
    entityId: "sess-1",
    evidenceRefs: ["cwmsg:123", { ref: "cwc:456", snippet: "contact" }],
  });

  assert.equal(result.id, "evt-1");
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO audit_events/);
  assert.match(calls[1].sql, /INSERT INTO evidence_items/);

  const evidencePayload = JSON.parse(calls[1].params[0]);
  assert.equal(evidencePayload.length, 2);
  assert.equal(evidencePayload[0].source_table, "cw_messages");
  assert.equal(evidencePayload[1].source_table, "cw_contacts");
});

test("writeAuditEvent throws when audit insert does not return row", async () => {
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
  };

  await assert.rejects(
    () =>
      writeAuditEvent(pool, {
        projectId: "00000000-0000-4000-8000-000000000001",
        accountScopeId: "00000000-0000-4000-8000-000000000011",
        action: "broken.event",
        evidenceRefs: [],
      }),
    (err) => err?.code === "audit_write_failed"
  );
});

test("listAuditEvents clamps pagination and supports action filter", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: "evt-1" }] };
    },
  };
  const scope = {
    projectId: "00000000-0000-4000-8000-000000000001",
    accountScopeId: "00000000-0000-4000-8000-000000000011",
  };

  const filtered = await listAuditEvents(pool, scope, {
    action: "  outbound.approve  ",
    limit: "999",
    offset: "-10",
  });
  assert.equal(filtered.length, 1);
  assert.match(calls[0].sql, /AND action = \$3/);
  assert.deepStrictEqual(calls[0].params, [scope.projectId, scope.accountScopeId, "outbound.approve", 200, 0]);

  const unfiltered = await listAuditEvents(pool, scope, {});
  assert.equal(unfiltered.length, 1);
  assert.doesNotMatch(calls[1].sql, /AND action = \$3/);
  assert.deepStrictEqual(calls[1].params, [scope.projectId, scope.accountScopeId, 50, 0]);
});
