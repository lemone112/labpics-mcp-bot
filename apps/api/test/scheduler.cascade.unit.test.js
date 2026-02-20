import test from "node:test";
import assert from "node:assert/strict";

import { _CASCADE_CHAINS_FOR_TESTING as CASCADE_CHAINS } from "../src/domains/core/scheduler.js";

test("cascade chains are defined for connectors_sync_cycle", () => {
  assert.ok(Array.isArray(CASCADE_CHAINS.connectors_sync_cycle));
  assert.ok(CASCADE_CHAINS.connectors_sync_cycle.includes("signals_extraction"));
  assert.ok(CASCADE_CHAINS.connectors_sync_cycle.includes("embeddings_run"));
});

test("cascade chains are defined for signals_extraction", () => {
  assert.ok(Array.isArray(CASCADE_CHAINS.signals_extraction));
  assert.ok(CASCADE_CHAINS.signals_extraction.includes("health_scoring"));
});

test("cascade chains are defined for health_scoring", () => {
  assert.ok(Array.isArray(CASCADE_CHAINS.health_scoring));
  assert.ok(CASCADE_CHAINS.health_scoring.includes("analytics_aggregates"));
});

test("cascade chains do not contain circular references", () => {
  const visited = new Set();
  function walk(jobType) {
    if (visited.has(jobType)) {
      assert.fail(`Circular cascade detected at ${jobType}`);
    }
    visited.add(jobType);
    const downstream = CASCADE_CHAINS[jobType] || [];
    for (const d of downstream) walk(d);
    visited.delete(jobType);
  }
  for (const jobType of Object.keys(CASCADE_CHAINS)) {
    walk(jobType);
  }
});

test("all cascade downstream targets are valid job type strings", () => {
  for (const [trigger, targets] of Object.entries(CASCADE_CHAINS)) {
    assert.ok(typeof trigger === "string" && trigger.length > 0, `invalid trigger key: ${trigger}`);
    assert.ok(Array.isArray(targets), `targets for ${trigger} must be an array`);
    for (const target of targets) {
      assert.ok(typeof target === "string" && target.length > 0, `invalid target in ${trigger}: ${target}`);
    }
  }
});
