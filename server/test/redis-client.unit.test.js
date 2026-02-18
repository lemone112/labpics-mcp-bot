import test from "node:test";
import assert from "node:assert/strict";

import { createRedisClient } from "../src/lib/redis.js";

test("createRedisClient returns null when no URL is provided", () => {
  const original = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const client = createRedisClient({ url: undefined, logger, name: "test" });
  assert.strictEqual(client, null);

  // Restore env
  if (original !== undefined) {
    process.env.REDIS_URL = original;
  }
});

test("createRedisClient returns null when url is empty string", () => {
  const original = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const client = createRedisClient({ url: "", logger, name: "test" });
  assert.strictEqual(client, null);

  if (original !== undefined) {
    process.env.REDIS_URL = original;
  }
});
