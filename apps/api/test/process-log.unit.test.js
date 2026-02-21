import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  failProcessRun,
  finishProcessRun,
  startProcessRun,
  warnProcess,
} from "../src/domains/core/process-log.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

describe("process-log start/finish/fail/warn", () => {
  it("startProcessRun inserts process_started with normalized source and payload", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };

    const run = await startProcessRun(pool, scope, "sync_cycle", {
      run_id: "run-1",
      started_at: "2026-02-21T00:00:00.000Z",
      source: " SYSTEM ",
      payload: { custom: true },
    });

    assert.equal(run.run_id, "run-1");
    assert.equal(run.process, "sync_cycle");
    assert.equal(run.source, "system");
    assert.equal(run.source_ref, "process:sync_cycle:run-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "process_started");
    const payload = JSON.parse(String(calls[0][6]));
    assert.equal(payload.process, "sync_cycle");
    assert.equal(payload.phase, "start");
    assert.equal(payload.run_id, "run-1");
    assert.equal(payload.custom, true);
  });

  it("finishProcessRun is a no-op when run is null", async () => {
    let called = false;
    const pool = {
      query: async () => {
        called = true;
        return { rows: [] };
      },
    };

    await finishProcessRun(pool, scope, null, {});
    assert.equal(called, false);
  });

  it("finishProcessRun stores duration_ms as null for invalid started_at", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };
    const run = {
      process: "sync_cycle",
      run_id: "run-finish",
      started_at: "invalid-date",
      source: "system",
      source_ref: "process:sync_cycle:run-finish",
    };

    await finishProcessRun(pool, scope, run, {
      finished_at: "2026-02-21T01:00:00.000Z",
      counters: { ok: 3 },
      payload: { marker: "finish" },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "process_finished");
    const payload = JSON.parse(String(calls[0][6]));
    assert.equal(payload.phase, "finish");
    assert.equal(payload.duration_ms, null);
    assert.equal(payload.counters.ok, 3);
    assert.equal(payload.marker, "finish");
  });

  it("failProcessRun stores failure payload and truncates error message", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };
    const run = {
      process: "sync_cycle",
      run_id: "run-fail",
      started_at: "invalid-date",
      source: "system",
      source_ref: "process:sync_cycle:run-fail",
    };

    await failProcessRun(
      pool,
      scope,
      run,
      new Error("x".repeat(5000)),
      { counters: { failed: 1 }, payload: { marker: "fail" } }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "process_failed");
    const payload = JSON.parse(String(calls[0][6]));
    assert.equal(payload.phase, "fail");
    assert.equal(payload.duration_ms, null);
    assert.equal(payload.counters.failed, 1);
    assert.equal(payload.marker, "fail");
    assert.equal(typeof payload.error_message, "string");
    assert.ok(payload.error_message.length <= 4000);
  });

  it("warnProcess uses custom source/source_ref and writes process_warning event", async () => {
    const calls = [];
    const pool = {
      query: async (_sql, params) => {
        calls.push(params);
        return { rows: [] };
      },
    };

    await warnProcess(pool, scope, "sync_cycle", "warning-text", {
      occurred_at: "2026-02-21T02:00:00.000Z",
      source: "Scheduler",
      source_ref: "custom-source-ref",
      payload: { extra: "data" },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], "process_warning");
    assert.equal(calls[0][4], "scheduler");
    assert.equal(calls[0][5], "custom-source-ref");
    const payload = JSON.parse(String(calls[0][6]));
    assert.equal(payload.process, "sync_cycle");
    assert.equal(payload.phase, "warning");
    assert.equal(payload.warning_message, "warning-text");
    assert.equal(payload.extra, "data");
  });
});
