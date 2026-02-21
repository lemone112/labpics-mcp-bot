import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertDateRange, normalizeDateKey } from "../src/routes/lightrag.js";

describe("assertDateRange", () => {
  it("allows empty bounds", () => {
    assert.doesNotThrow(() => assertDateRange(null, null));
    assert.doesNotThrow(() => assertDateRange(new Date("2026-01-01"), null));
  });

  it("allows valid range", () => {
    assert.doesNotThrow(() => assertDateRange(new Date("2026-01-01"), new Date("2026-01-31")));
  });

  it("rejects inverted range with ApiError shape", () => {
    assert.throws(
      () => assertDateRange(new Date("2026-02-01"), new Date("2026-01-01")),
      (err) => err?.status === 400 && err?.code === "invalid_date_range"
    );
  });
});


describe("normalizeDateKey", () => {
  it("returns empty string for empty input", () => {
    assert.equal(normalizeDateKey(null), "");
  });

  it("normalizes date to YYYY-MM-DD", () => {
    assert.equal(normalizeDateKey(new Date("2026-01-15T12:34:56.000Z")), "2026-01-15");
    assert.equal(normalizeDateKey("2026-01-15"), "2026-01-15");
  });

  it("uses UTC normalization for timezone-aware inputs", () => {
    assert.equal(normalizeDateKey("2026-01-15T23:30:00-03:00"), "2026-01-16");
  });

  it("returns empty string for invalid date", () => {
    assert.equal(normalizeDateKey("not-a-date"), "");
  });
});
