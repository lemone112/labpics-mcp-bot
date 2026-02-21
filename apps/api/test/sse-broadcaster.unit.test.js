import test from "node:test";
import assert from "node:assert/strict";

import { createSseBroadcaster } from "../src/infra/sse-broadcaster.js";

function createMockLogger() {
  const logs = [];
  return {
    info: (...args) => logs.push({ level: "info", args }),
    warn: (...args) => logs.push({ level: "warn", args }),
    error: (...args) => logs.push({ level: "error", args }),
    logs,
  };
}

function createMockReply() {
  const chunks = [];
  return {
    raw: {
      destroyed: false,
      writable: true,
      write(data) {
        chunks.push(data);
        return true;
      },
    },
    chunks,
  };
}

test("addClient registers a client and getStats reflects it", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 0,
    projects: 0,
  });

  const reply = createMockReply();
  const cleanup = broadcaster.addClient("proj-1", reply, "sess-1");

  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 1,
    projects: 1,
  });

  cleanup();

  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 0,
    projects: 0,
  });
});

test("addClient supports multiple clients per project", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const reply1 = createMockReply();
  const reply2 = createMockReply();
  const cleanup1 = broadcaster.addClient("proj-1", reply1, "sess-1");
  const cleanup2 = broadcaster.addClient("proj-1", reply2, "sess-2");

  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 2,
    projects: 1,
  });

  cleanup1();
  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 1,
    projects: 1,
  });

  cleanup2();
  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 0,
    projects: 0,
  });
});

test("addClient supports multiple projects", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const reply1 = createMockReply();
  const reply2 = createMockReply();
  broadcaster.addClient("proj-1", reply1, null);
  broadcaster.addClient("proj-2", reply2, null);

  assert.deepStrictEqual(broadcaster.getStats(), {
    total_connections: 2,
    projects: 2,
  });
});

test("broadcast sends SSE-formatted data to correct project clients", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const reply1 = createMockReply();
  const reply2 = createMockReply();
  const replyOther = createMockReply();
  broadcaster.addClient("proj-1", reply1, null);
  broadcaster.addClient("proj-1", reply2, null);
  broadcaster.addClient("proj-2", replyOther, null);

  const sent = broadcaster.broadcast("proj-1", "job_completed", {
    job_type: "test",
    status: "ok",
  });

  assert.strictEqual(sent, 2);
  assert.strictEqual(reply1.chunks.length, 1);
  assert.strictEqual(reply2.chunks.length, 1);
  assert.strictEqual(replyOther.chunks.length, 0);

  const expected = 'event: job_completed\ndata: {"job_type":"test","status":"ok"}\n\n';
  assert.strictEqual(reply1.chunks[0], expected);
  assert.strictEqual(reply2.chunks[0], expected);
});

test("broadcast returns 0 for unknown project", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const sent = broadcaster.broadcast("unknown-proj", "test", {});
  assert.strictEqual(sent, 0);
});

test("broadcast handles write errors gracefully", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const failingReply = {
    raw: {
      write() {
        throw new Error("connection reset");
      },
    },
  };
  const goodReply = createMockReply();
  broadcaster.addClient("proj-1", failingReply, null);
  broadcaster.addClient("proj-1", goodReply, null);

  const sent = broadcaster.broadcast("proj-1", "test", { ok: true });

  // Only the good reply should count
  assert.strictEqual(sent, 1);
  assert.strictEqual(goodReply.chunks.length, 1);
});

test("broadcastAll sends to all projects", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const reply1 = createMockReply();
  const reply2 = createMockReply();
  broadcaster.addClient("proj-1", reply1, null);
  broadcaster.addClient("proj-2", reply2, null);

  const sent = broadcaster.broadcastAll("system_event", { msg: "hello" });
  assert.strictEqual(sent, 2);
  assert.strictEqual(reply1.chunks.length, 1);
  assert.strictEqual(reply2.chunks.length, 1);
});

test("cleanup function is idempotent (double-call safe)", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const reply = createMockReply();
  const cleanup = broadcaster.addClient("proj-1", reply, null);

  cleanup();
  assert.strictEqual(broadcaster.getStats().total_connections, 0);

  // Second call should not throw or go negative
  cleanup();
  assert.strictEqual(broadcaster.getStats().total_connections, 0);
});


test("enforces per-project connection limit", () => {
  const logger = createMockLogger();
  const broadcaster = createSseBroadcaster(logger);

  const cleanups = [];
  for (let i = 0; i < 20; i++) {
    cleanups.push(broadcaster.addClient("proj-limit", createMockReply(), null));
  }

  assert.throws(
    () => broadcaster.addClient("proj-limit", createMockReply(), null),
    (err) => err?.code === "sse_project_limit_reached"
  );

  for (const cleanup of cleanups) cleanup();
});
