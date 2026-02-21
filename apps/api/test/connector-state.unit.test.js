import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addSeconds,
  clampInt,
  dedupeKeyForError,
  nextBackoffSeconds,
} from "../src/domains/connectors/connector-state.js";

describe("nextBackoffSeconds", () => {
  it("returns base seconds for attempt 1", () => {
    assert.equal(nextBackoffSeconds(1, 30), 30);
  });

  it("doubles for each subsequent attempt", () => {
    assert.equal(nextBackoffSeconds(2, 30), 60);
    assert.equal(nextBackoffSeconds(3, 30), 120);
    assert.equal(nextBackoffSeconds(4, 30), 240);
  });

  it("caps at maximum", () => {
    const cap = 6 * 60 * 60; // 21600
    const result = nextBackoffSeconds(20, 30, cap);
    assert.equal(result, cap);
  });

  it("handles attempt 0 same as attempt 1", () => {
    // power = max(0, min(10, -1)) = 0, so 30 * 2^0 = 30
    assert.equal(nextBackoffSeconds(0, 30), 30);
  });

  it("handles custom base seconds", () => {
    assert.equal(nextBackoffSeconds(1, 60), 60);
    assert.equal(nextBackoffSeconds(2, 60), 120);
  });

  it("clamps power to max 10", () => {
    // attempt 12: power = min(10, 11) = 10 => 30 * 1024 = 30720
    const result = nextBackoffSeconds(12, 30, 100000);
    assert.equal(result, 30 * Math.pow(2, 10));
  });

  it("real-world progression: 30s base, 5 retries", () => {
    const progression = [1, 2, 3, 4, 5].map((a) => nextBackoffSeconds(a, 30));
    assert.deepStrictEqual(progression, [30, 60, 120, 240, 480]);
  });
});

describe("dedupeKeyForError", () => {
  it("generates consistent sha1 hash", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    const key2 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    assert.equal(key1, key2);
    assert.equal(key1.length, 40); // sha1 hex
  });

  it("produces different keys for different inputs", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    const key2 = dedupeKeyForError({
      connector: "linear",
      mode: "http",
      operation: "sync",
      sourceRef: "ref1",
      errorKind: "timeout",
    });
    assert.notEqual(key1, key2);
  });

  it("handles missing sourceRef and errorKind", () => {
    const key = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
      sourceRef: undefined,
      errorKind: undefined,
    });
    assert.equal(key.length, 40);
  });

  it("different modes produce different keys", () => {
    const key1 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "http",
      operation: "sync",
    });
    const key2 = dedupeKeyForError({
      connector: "chatwoot",
      mode: "mcp",
      operation: "sync",
    });
    assert.notEqual(key1, key2);
  });
});

describe("addSeconds", () => {
  it("adds seconds to a date", () => {
    const base = new Date("2024-01-01T00:00:00Z");
    const result = addSeconds(base, 60);
    assert.equal(result.toISOString(), "2024-01-01T00:01:00.000Z");
  });

  it("handles negative seconds", () => {
    const base = new Date("2024-01-01T00:01:00Z");
    const result = addSeconds(base, -60);
    assert.equal(result.toISOString(), "2024-01-01T00:00:00.000Z");
  });

  it("handles large values", () => {
    const base = new Date("2024-01-01T00:00:00Z");
    const result = addSeconds(base, 86400); // 24 hours
    assert.equal(result.toISOString(), "2024-01-02T00:00:00.000Z");
  });
});

describe("clampInt (connector-state)", () => {
  it("parses and clamps integer", () => {
    assert.equal(clampInt("50", 0, 0, 100), 50);
  });

  it("returns fallback for non-numeric", () => {
    assert.equal(clampInt("abc", 5), 5);
    assert.equal(clampInt(null, 5), 5);
  });

  it("clamps to bounds", () => {
    assert.equal(clampInt("200", 5, 0, 100), 100);
    assert.equal(clampInt("-10", 5, 0, 100), 0);
  });
});
