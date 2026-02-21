import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildUtcDayRange } from "../src/domains/rag/date-range.js";

describe("buildUtcDayRange", () => {
  it("returns null bounds for empty input", () => {
    const result = buildUtcDayRange(null, undefined);
    assert.equal(result.dateFrom, null);
    assert.equal(result.dateTo, null);
    assert.equal(result.dateToExclusive, null);
  });

  it("normalizes both bounds to UTC day start and keeps inclusive end via exclusive +1 day", () => {
    const result = buildUtcDayRange("2026-01-10", "2026-01-15");
    assert.equal(result.dateFrom?.toISOString(), "2026-01-10T00:00:00.000Z");
    assert.equal(result.dateTo?.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(result.dateToExclusive?.toISOString(), "2026-01-16T00:00:00.000Z");
  });

  it("drops invalid bounds", () => {
    const result = buildUtcDayRange("bad-date", "2026-01-15");
    assert.equal(result.dateFrom, null);
    assert.equal(result.dateTo?.toISOString(), "2026-01-15T00:00:00.000Z");
    assert.equal(result.dateToExclusive?.toISOString(), "2026-01-16T00:00:00.000Z");
  });

  it("is deterministic for timezone-aware datetime inputs", () => {
    const result = buildUtcDayRange("2026-01-15T23:30:00-03:00", "2026-01-16T10:00:00+03:00");
    assert.equal(result.dateFrom?.toISOString(), "2026-01-16T00:00:00.000Z");
    assert.equal(result.dateTo?.toISOString(), "2026-01-16T00:00:00.000Z");
    assert.equal(result.dateToExclusive?.toISOString(), "2026-01-17T00:00:00.000Z");
  });
});
