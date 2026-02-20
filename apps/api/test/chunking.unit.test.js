import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chunkText, shortSnippet, toIsoTime, toPositiveInt } from "../src/lib/chunking.js";

describe("chunkText", () => {
  it("splits text into fixed-size chunks", () => {
    const result = chunkText("abcdefghij", 4);
    assert.deepStrictEqual(result, ["abcd", "efgh", "ij"]);
  });

  it("returns empty array for empty input", () => {
    assert.deepStrictEqual(chunkText("", 10), []);
    assert.deepStrictEqual(chunkText(null, 10), []);
    assert.deepStrictEqual(chunkText(undefined, 10), []);
  });

  it("collapses whitespace before chunking", () => {
    const result = chunkText("a  b\n\nc   d", 4);
    assert.deepStrictEqual(result, ["a b ", "c d"]);
  });

  it("returns single chunk when text fits", () => {
    const result = chunkText("hello", 100);
    assert.deepStrictEqual(result, ["hello"]);
  });

  it("trims leading and trailing whitespace", () => {
    const result = chunkText("   hello   ", 100);
    assert.deepStrictEqual(result, ["hello"]);
  });

  it("handles whitespace-only input as empty", () => {
    assert.deepStrictEqual(chunkText("   \n\t  ", 5), []);
  });
});

describe("shortSnippet", () => {
  it("returns full text when within limit", () => {
    assert.equal(shortSnippet("hello", 10), "hello");
  });

  it("truncates with ellipsis when over limit", () => {
    assert.equal(shortSnippet("hello world", 8), "hello...");
  });

  it("handles exact boundary", () => {
    assert.equal(shortSnippet("hello", 5), "hello");
  });

  it("collapses whitespace", () => {
    assert.equal(shortSnippet("a  b  c", 80), "a b c");
  });

  it("handles null/undefined", () => {
    assert.equal(shortSnippet(null), "");
    assert.equal(shortSnippet(undefined), "");
    assert.equal(shortSnippet(""), "");
  });

  it("uses default length of 80", () => {
    const long = "a".repeat(100);
    const result = shortSnippet(long);
    assert.equal(result.length, 80);
    assert.ok(result.endsWith("..."));
  });
});

describe("toIsoTime", () => {
  it("converts unix seconds to ISO string", () => {
    const result = toIsoTime(1700000000);
    assert.ok(result.startsWith("2023-11-14"));
  });

  it("converts unix milliseconds to ISO string", () => {
    const result = toIsoTime(1700000000000);
    assert.ok(result.startsWith("2023-11-14"));
  });

  it("auto-detects seconds vs milliseconds", () => {
    const fromSeconds = toIsoTime(1700000000);
    const fromMs = toIsoTime(1700000000000);
    assert.equal(fromSeconds, fromMs);
  });

  it("returns null for null/undefined", () => {
    assert.equal(toIsoTime(null), null);
    assert.equal(toIsoTime(undefined), null);
  });

  it("handles ISO string input", () => {
    const result = toIsoTime("2023-11-14T00:00:00Z");
    assert.ok(result.startsWith("2023-11-14"));
  });

  it("returns null for invalid date", () => {
    assert.equal(toIsoTime("not-a-date"), null);
    assert.equal(toIsoTime(NaN), null);
  });
});

describe("toPositiveInt", () => {
  it("parses valid integer", () => {
    assert.equal(toPositiveInt("42", 10), 42);
  });

  it("returns fallback for non-numeric", () => {
    assert.equal(toPositiveInt("abc", 10), 10);
    assert.equal(toPositiveInt(null, 10), 10);
    assert.equal(toPositiveInt(undefined, 10), 10);
  });

  it("clamps to min", () => {
    assert.equal(toPositiveInt("0", 10, 1, 100), 1);
    assert.equal(toPositiveInt("-5", 10, 1, 100), 1);
  });

  it("clamps to max", () => {
    assert.equal(toPositiveInt("999999", 10, 1, 100), 100);
  });

  it("handles float strings by truncating", () => {
    assert.equal(toPositiveInt("3.7", 10), 3);
  });
});
