import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertDateRange } from "../src/routes/lightrag.js";

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
