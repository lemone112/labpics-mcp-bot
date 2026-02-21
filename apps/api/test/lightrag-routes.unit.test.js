import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertDateRange, paginateEvidence } from "../src/routes/lightrag.js";

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


describe("paginateEvidence", () => {
  it("slices evidence by offset and limit", () => {
    const evidence = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const result = paginateEvidence(evidence, 1, 2);
    assert.deepEqual(result.evidence.map((i) => i.id), [2, 3]);
    assert.equal(result.total, 4);
    assert.equal(result.offset, 1);
    assert.equal(result.limit, 2);
  });

  it("applies sane defaults for invalid values", () => {
    const evidence = [{ id: 1 }, { id: 2 }];
    const result = paginateEvidence(evidence, -10, 0);
    assert.deepEqual(result.evidence.map((i) => i.id), [1, 2]);
    assert.equal(result.offset, 0);
    assert.equal(result.limit, 10);
  });

  it("handles non-array evidence defensively", () => {
    const result = paginateEvidence(null, 0, 10);
    assert.deepEqual(result.evidence, []);
    assert.equal(result.total, 0);
  });
});
