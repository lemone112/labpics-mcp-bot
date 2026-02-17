import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGraphNode,
  buildGraphEdge,
  buildGraphEvent,
  buildProvenanceRows,
  KAG_NODE_TYPES,
  KAG_EVENT_TYPES,
} from "../src/kag/graph/index.js";

// ---------------------------------------------------------------------------
// KAG_NODE_TYPES & KAG_EVENT_TYPES
// ---------------------------------------------------------------------------

test("KAG_NODE_TYPES has 15 entries", () => {
  assert.equal(KAG_NODE_TYPES.length, 15);
  assert.ok(KAG_NODE_TYPES.includes("project"));
  assert.ok(KAG_NODE_TYPES.includes("client"));
  assert.ok(KAG_NODE_TYPES.includes("blocker"));
  assert.ok(KAG_NODE_TYPES.includes("offer"));
});

test("KAG_EVENT_TYPES has 15 entries", () => {
  assert.equal(KAG_EVENT_TYPES.length, 15);
  assert.ok(KAG_EVENT_TYPES.includes("message_sent"));
  assert.ok(KAG_EVENT_TYPES.includes("task_blocked"));
  assert.ok(KAG_EVENT_TYPES.includes("need_detected"));
  assert.ok(KAG_EVENT_TYPES.includes("offer_created"));
});

// ---------------------------------------------------------------------------
// buildGraphNode
// ---------------------------------------------------------------------------

test("buildGraphNode returns defaults", () => {
  const node = buildGraphNode({ node_type: "project", node_key: "p1" });
  assert.equal(node.node_type, "project");
  assert.equal(node.node_key, "p1");
  assert.equal(node.status, "active");
  assert.equal(node.title, null);
  assert.deepEqual(node.payload, {});
  assert.deepEqual(node.numeric_fields, {});
  assert.deepEqual(node.source_refs, []);
  assert.deepEqual(node.rag_chunk_refs, []);
});

test("buildGraphNode lowercases node_type", () => {
  const node = buildGraphNode({ node_type: "PROJECT", node_key: "p2" });
  assert.equal(node.node_type, "project");
});

test("buildGraphNode truncates long values", () => {
  const longKey = "x".repeat(1000);
  const node = buildGraphNode({ node_type: "task", node_key: longKey });
  assert.ok(node.node_key.length <= 400);
});

test("buildGraphNode deduplicates source_refs", () => {
  const ref = { message_id: "m1" };
  const node = buildGraphNode({
    node_type: "task",
    node_key: "t1",
    source_refs: [ref, ref, ref],
  });
  assert.equal(node.source_refs.length, 1);
});

// ---------------------------------------------------------------------------
// buildGraphEdge
// ---------------------------------------------------------------------------

test("buildGraphEdge returns defaults with weight=1", () => {
  const edge = buildGraphEdge({
    from_node_id: "aaa",
    to_node_id: "bbb",
    relation_type: "project_has_task",
  });
  assert.equal(edge.from_node_id, "aaa");
  assert.equal(edge.to_node_id, "bbb");
  assert.equal(edge.relation_type, "project_has_task");
  assert.equal(edge.weight, 1);
  assert.equal(edge.status, "active");
});

test("buildGraphEdge respects custom weight", () => {
  const edge = buildGraphEdge({
    from_node_id: "a",
    to_node_id: "b",
    relation_type: "rel",
    weight: 0.5,
  });
  assert.equal(edge.weight, 0.5);
});

test("buildGraphEdge returns null for missing from/to ids", () => {
  const edge = buildGraphEdge({ relation_type: "rel" });
  assert.equal(edge.from_node_id, null);
  assert.equal(edge.to_node_id, null);
});

// ---------------------------------------------------------------------------
// buildGraphEvent
// ---------------------------------------------------------------------------

test("buildGraphEvent lowercases event_type and formats timestamp", () => {
  const ev = buildGraphEvent({
    event_type: "Message_Sent",
    event_ts: "2026-02-17T10:00:00Z",
  });
  assert.equal(ev.event_type, "message_sent");
  assert.equal(ev.event_ts, "2026-02-17T10:00:00.000Z");
  assert.equal(ev.status, "open");
});

test("buildGraphEvent merges evidence from source_refs and evidence_refs", () => {
  const ev = buildGraphEvent({
    event_type: "task_blocked",
    event_ts: "2026-02-17T10:00:00Z",
    evidence_refs: [{ message_id: "m1" }],
  });
  assert.equal(ev.source_refs.length, 1);
  assert.equal(ev.source_refs[0].message_id, "m1");
});

// ---------------------------------------------------------------------------
// buildProvenanceRows
// ---------------------------------------------------------------------------

test("buildProvenanceRows infers source_kind correctly", () => {
  const rows = buildProvenanceRows({
    objectKind: "kag_node",
    objectId: "node-1",
    refs: [
      { message_id: "m1" },
      { linear_issue_id: "L1" },
      { attio_record_id: "A1" },
      { doc_url: "http://example.com" },
      { rag_chunk_id: "c1" },
    ],
  });

  assert.equal(rows.length, 5);
  assert.equal(rows[0].source_kind, "chatwoot_message");
  assert.equal(rows[1].source_kind, "linear_issue");
  assert.equal(rows[2].source_kind, "attio_record");
  assert.equal(rows[3].source_kind, "document");
  assert.equal(rows[4].source_kind, "rag_chunk");
});

test("buildProvenanceRows filters out invalid refs", () => {
  const rows = buildProvenanceRows({
    objectKind: "kag_node",
    objectId: "node-2",
    refs: [null, {}, { message_id: "m1" }],
  });
  assert.equal(rows.length, 1);
});

test("buildProvenanceRows limits to 60 refs", () => {
  const manyRefs = Array.from({ length: 100 }, (_, i) => ({ message_id: `m${i}` }));
  const rows = buildProvenanceRows({
    objectKind: "kag_edge",
    objectId: "edge-1",
    refs: manyRefs,
  });
  assert.ok(rows.length <= 60);
});
