import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// We cannot test with a real Redis connection in unit tests,
// so we test the pubsub wrapper behavior by mocking the redis client factory.

// This test validates the structural contract of createRedisPubSub
// when Redis is unavailable (null clients).

test("createRedisPubSub returns no-op when REDIS_URL not set", async () => {
  // Save original env
  const original = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  // Dynamic import to get fresh module
  const { createRedisPubSub } = await import("../src/infra/redis-pubsub.js");

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const pubsub = createRedisPubSub({ url: undefined, logger });

  assert.strictEqual(pubsub.enabled, false);

  // publish should return 0 (no-op)
  const result = await pubsub.publish("test_channel", JSON.stringify({ test: true }));
  assert.strictEqual(result, 0);

  // subscribe should return a no-op unsubscribe function
  const unsub = await pubsub.subscribe("test_channel", () => {});
  assert.strictEqual(typeof unsub, "function");
  // Should not throw
  unsub();

  // close should not throw
  await pubsub.close();

  const stats = pubsub.getStats();
  assert.equal(typeof stats, "object");
  assert.equal(stats.publish_total, 0);
  assert.equal(stats.publish_failed_total, 0);
  assert.equal(stats.subscribed_channels, 0);

  // Restore env
  if (original !== undefined) {
    process.env.REDIS_URL = original;
  }
});
