import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toPositiveInt,
  clamp,
  clampInt,
  toNumber,
  round,
  toDate,
  toIso,
  addDaysIso,
  asText,
  toBoolean,
  boolFromEnv,
  isUuid,
  assertUuid,
  requiredEnv,
} from "../src/infra/utils.js";

describe("toPositiveInt", () => {
  it("parses valid integer", () => {
    assert.equal(toPositiveInt("42", 10), 42);
  });

  it("returns fallback for NaN", () => {
    assert.equal(toPositiveInt("abc", 5), 5);
    assert.equal(toPositiveInt(null, 5), 5);
    assert.equal(toPositiveInt(undefined, 5), 5);
  });

  it("clamps to min/max", () => {
    assert.equal(toPositiveInt("0", 5, 1, 100), 1);
    assert.equal(toPositiveInt("200", 5, 1, 100), 100);
  });
});

describe("clamp", () => {
  it("clamps within range", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
  });

  it("returns min for NaN", () => {
    assert.equal(clamp("abc", 0, 10), 0);
    assert.equal(clamp(NaN, 0, 10), 0);
  });
});

describe("clampInt", () => {
  it("parses and clamps integer", () => {
    assert.equal(clampInt("42", 0, 0, 100), 42);
    assert.equal(clampInt("200", 0, 0, 100), 100);
  });

  it("returns fallback for invalid", () => {
    assert.equal(clampInt("abc", 5, 0, 100), 5);
    assert.equal(clampInt(null, 5, 0, 100), 5);
  });
});

describe("toNumber", () => {
  it("parses valid number", () => {
    assert.equal(toNumber("3.14"), 3.14);
    assert.equal(toNumber(42), 42);
  });

  it("returns fallback for NaN", () => {
    assert.equal(toNumber("abc", 0), 0);
    assert.equal(toNumber(NaN, 0), 0);
    assert.equal(toNumber(Infinity, 0), 0);
  });

  it("clamps to min/max", () => {
    assert.equal(toNumber(200, 0, 0, 100), 100);
    assert.equal(toNumber(-5, 0, 0, 100), 0);
  });
});

describe("round", () => {
  it("rounds to specified digits", () => {
    assert.equal(round(3.14159, 2), 3.14);
    assert.equal(round(3.14159, 4), 3.1416);
  });

  it("returns 0 for non-finite", () => {
    assert.equal(round(NaN, 2), 0);
    assert.equal(round(Infinity, 2), 0);
  });

  it("defaults to 2 digits", () => {
    assert.equal(round(3.14159), 3.14);
  });
});

describe("toDate", () => {
  it("returns Date for valid input", () => {
    const d = toDate("2024-01-01");
    assert.ok(d instanceof Date);
    assert.ok(Number.isFinite(d.getTime()));
  });

  it("returns fallback for invalid input", () => {
    assert.equal(toDate("invalid", null), null);
    assert.equal(toDate("", null), null);
    assert.equal(toDate(null, null), null);
  });

  it("passes through Date instances", () => {
    const d = new Date("2024-01-01");
    assert.equal(toDate(d), d);
  });
});

describe("toIso", () => {
  it("returns ISO string for valid date", () => {
    const result = toIso("2024-01-01T00:00:00Z");
    assert.ok(result.startsWith("2024-01-01"));
  });

  it("returns null for invalid input", () => {
    assert.equal(toIso(null), null);
    assert.equal(toIso(""), null);
    assert.equal(toIso("invalid"), null);
  });
});

describe("addDaysIso", () => {
  it("adds days to a date", () => {
    const result = addDaysIso("2024-01-01T00:00:00Z", 7);
    assert.ok(result.startsWith("2024-01-08"));
  });

  it("handles negative days", () => {
    const result = addDaysIso("2024-01-10T00:00:00Z", -3);
    assert.ok(result.startsWith("2024-01-07"));
  });

  it("falls back to now() for invalid base", () => {
    const result = addDaysIso("invalid", 1);
    assert.ok(result); // returns some ISO string
    const date = new Date(result);
    assert.ok(Number.isFinite(date.getTime()));
  });
});

describe("asText", () => {
  it("trims and returns text", () => {
    assert.equal(asText("  hello  "), "hello");
  });

  it("returns null for null/undefined", () => {
    assert.equal(asText(null), null);
    assert.equal(asText(undefined), null);
  });

  it("returns null for empty string", () => {
    assert.equal(asText(""), null);
    assert.equal(asText("   "), null);
  });

  it("truncates to maxLen", () => {
    assert.equal(asText("abcdefghij", 5), "abcde");
  });

  it("defaults to 2000 chars", () => {
    const long = "a".repeat(3000);
    assert.equal(asText(long).length, 2000);
  });
});

describe("toBoolean", () => {
  it("recognizes truthy strings", () => {
    assert.equal(toBoolean("1"), true);
    assert.equal(toBoolean("true"), true);
    assert.equal(toBoolean("TRUE"), true);
    assert.equal(toBoolean("yes"), true);
    assert.equal(toBoolean("on"), true);
    assert.equal(toBoolean("On"), true);
  });

  it("returns false for falsy strings", () => {
    assert.equal(toBoolean("0"), false);
    assert.equal(toBoolean("false"), false);
    assert.equal(toBoolean("no"), false);
    assert.equal(toBoolean("off"), false);
    assert.equal(toBoolean("random"), false);
  });

  it("returns fallback for empty/null", () => {
    assert.equal(toBoolean("", true), true);
    assert.equal(toBoolean(null, true), true);
    assert.equal(toBoolean(undefined, false), false);
  });
});

describe("boolFromEnv", () => {
  it("is an alias for toBoolean", () => {
    assert.equal(boolFromEnv, toBoolean);
  });
});

describe("UUID helpers", () => {
  it("isUuid recognizes valid UUID values", () => {
    assert.equal(isUuid("00000000-0000-4000-8000-000000000001"), true);
    assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  });

  it("isUuid rejects invalid UUID values", () => {
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid("123"), false);
    assert.equal(isUuid("550e8400-e29b-41d4-a716-44665544"), false);
  });

  it("assertUuid returns normalized uuid and throws on invalid values", () => {
    assert.equal(
      assertUuid("550e8400-e29b-41d4-a716-446655440000", "project_id"),
      "550e8400-e29b-41d4-a716-446655440000"
    );
    assert.throws(
      () => assertUuid("bad-id", "project_id"),
      (err) => err.name === "ApiError" && err.status === 400 && err.code === "invalid_uuid"
    );
  });
});

describe("requiredEnv", () => {
  it("throws for missing env var", () => {
    assert.throws(() => requiredEnv("__NONEXISTENT_TEST_VAR__"), {
      message: /Missing required env var/,
    });
  });

  it("returns value for existing env var", () => {
    const original = process.env.PATH;
    assert.equal(requiredEnv("PATH"), original);
  });
});
