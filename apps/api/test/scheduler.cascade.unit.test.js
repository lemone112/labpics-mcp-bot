import test from "node:test";
import assert from "node:assert/strict";

import {
  _CASCADE_CHAINS_FOR_TESTING as CASCADE_CHAINS,
  ensureDefaultScheduledJobs,
} from "../src/domains/core/scheduler.js";

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

test("default scheduled jobs are ensured once per scope", async () => {
  const calls = [];
  const pool = {
    query: async (_sql, params) => {
      calls.push(params);
      return { rowCount: 1, rows: [] };
    },
  };

  await ensureDefaultScheduledJobs(pool, {
    projectId: "00000000-0000-4000-8000-000000000101",
    accountScopeId: "00000000-0000-4000-8000-000000000201",
  });
  const firstScopeCalls = calls.length;
  assert.ok(firstScopeCalls > 0, "must seed at least one default job");
  const jobTypes = calls.map((params) => params[2]);
  assert.ok(
    jobTypes.includes("analytics_retention_cleanup"),
    "default scheduled jobs must include analytics_retention_cleanup"
  );

  await ensureDefaultScheduledJobs(pool, {
    projectId: "00000000-0000-4000-8000-000000000101",
    accountScopeId: "00000000-0000-4000-8000-000000000201",
  });
  assert.equal(calls.length, firstScopeCalls, "same scope must not be reseeded repeatedly");

  await ensureDefaultScheduledJobs(pool, {
    projectId: "00000000-0000-4000-8000-000000000102",
    accountScopeId: "00000000-0000-4000-8000-000000000202",
  });
  assert.equal(calls.length, firstScopeCalls * 2, "new scope must receive default job seeding");
});
