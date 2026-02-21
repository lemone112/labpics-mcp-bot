import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeClientValueScore,
  normalizeMessageAttachments,
  toDiscountLimit,
  uniqueProjectIds,
} from "../src/domains/analytics/portfolio.js";

describe("uniqueProjectIds", () => {
  it("deduplicates project IDs", () => {
    assert.deepStrictEqual(uniqueProjectIds(["a", "b", "a", "c"]), ["a", "b", "c"]);
  });

  it("trims whitespace", () => {
    assert.deepStrictEqual(uniqueProjectIds(["  a  ", "  b  "]), ["a", "b"]);
  });

  it("filters empty strings", () => {
    assert.deepStrictEqual(uniqueProjectIds(["a", "", null, "b"]), ["a", "b"]);
  });

  it("returns empty for non-array", () => {
    assert.deepStrictEqual(uniqueProjectIds(null), []);
    assert.deepStrictEqual(uniqueProjectIds("not array"), []);
  });

  it("limits to 100 projects", () => {
    const ids = Array.from({ length: 150 }, (_, i) => `proj-${i}`);
    const result = uniqueProjectIds(ids);
    assert.equal(result.length, 100);
  });
});

describe("computeClientValueScore", () => {
  it("returns baseline score with zero metrics", () => {
    const score = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 0,
      risks_open: 0,
    });
    assert.equal(score, 22); // base of 22
  });

  it("increases with revenue", () => {
    const base = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 0,
      risks_open: 0,
    });
    const withRevenue = computeClientValueScore({
      expected_revenue: 100000,
      health_score: 0,
      messages_7d: 0,
      risks_open: 0,
    });
    assert.ok(withRevenue > base);
  });

  it("increases with health score", () => {
    const base = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 0,
      risks_open: 0,
    });
    const withHealth = computeClientValueScore({
      expected_revenue: 0,
      health_score: 100,
      messages_7d: 0,
      risks_open: 0,
    });
    assert.ok(withHealth > base);
  });

  it("increases with engagement (messages)", () => {
    const base = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 0,
      risks_open: 0,
    });
    const withMessages = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 20,
      risks_open: 0,
    });
    assert.ok(withMessages > base);
  });

  it("decreases with risk pressure", () => {
    const base = computeClientValueScore({
      expected_revenue: 50000,
      health_score: 80,
      messages_7d: 10,
      risks_open: 0,
    });
    const withRisk = computeClientValueScore({
      expected_revenue: 50000,
      health_score: 80,
      messages_7d: 10,
      risks_open: 5,
    });
    assert.ok(withRisk < base);
  });

  it("clamps to 0-100", () => {
    const veryHigh = computeClientValueScore({
      expected_revenue: 10000000,
      health_score: 100,
      messages_7d: 100,
      risks_open: 0,
    });
    assert.ok(veryHigh <= 100);

    const veryLow = computeClientValueScore({
      expected_revenue: 0,
      health_score: 0,
      messages_7d: 0,
      risks_open: 10,
    });
    assert.ok(veryLow >= 0);
  });

  it("handles high revenue client correctly", () => {
    const score = computeClientValueScore({
      expected_revenue: 500000,
      health_score: 90,
      messages_7d: 15,
      risks_open: 1,
    });
    assert.ok(score >= 60);
    assert.ok(score <= 100);
  });
});

describe("toDiscountLimit", () => {
  it("returns 18% for score >= 85", () => {
    assert.equal(toDiscountLimit(85), 18);
    assert.equal(toDiscountLimit(100), 18);
  });

  it("returns 14% for score 70-84", () => {
    assert.equal(toDiscountLimit(70), 14);
    assert.equal(toDiscountLimit(84), 14);
  });

  it("returns 10% for score 55-69", () => {
    assert.equal(toDiscountLimit(55), 10);
    assert.equal(toDiscountLimit(69), 10);
  });

  it("returns 7% for score 40-54", () => {
    assert.equal(toDiscountLimit(40), 7);
    assert.equal(toDiscountLimit(54), 7);
  });

  it("returns 5% for score < 40", () => {
    assert.equal(toDiscountLimit(39), 5);
    assert.equal(toDiscountLimit(0), 5);
  });

  it("handles non-numeric values", () => {
    assert.equal(toDiscountLimit(null), 5);
    assert.equal(toDiscountLimit(undefined), 5);
    assert.equal(toDiscountLimit("abc"), 5);
  });
});

describe("normalizeMessageAttachments", () => {
  it("normalizes attachment objects", () => {
    const attachments = [
      { id: "1", file_name: "doc.pdf", data_url: "http://example.com/doc.pdf", file_type: "application/pdf" },
    ];
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "1");
    assert.equal(result[0].name, "doc.pdf");
    assert.equal(result[0].url, "http://example.com/doc.pdf");
    assert.equal(result[0].content_type, "application/pdf");
  });

  it("returns empty for non-array", () => {
    assert.deepStrictEqual(normalizeMessageAttachments(null), []);
    assert.deepStrictEqual(normalizeMessageAttachments("string"), []);
    assert.deepStrictEqual(normalizeMessageAttachments(42), []);
  });

  it("filters null entries", () => {
    const attachments = [null, undefined, { id: "1" }];
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result.length, 1);
  });

  it("filters entries without id", () => {
    const attachments = [{ file_name: "test.txt" }]; // no id, file_id, url, or data_url
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result.length, 0);
  });

  it("limits to 8 attachments", () => {
    const attachments = Array.from({ length: 15 }, (_, i) => ({ id: String(i) }));
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result.length, 8);
  });

  it("uses fallback field names", () => {
    const attachments = [
      { file_id: "f1", filename: "test.txt", url: "http://example.com", content_type: "text/plain" },
    ];
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result[0].id, "f1");
    assert.equal(result[0].name, "test.txt");
    assert.equal(result[0].url, "http://example.com");
    assert.equal(result[0].content_type, "text/plain");
  });

  it("defaults name to 'attachment' and content_type to 'file'", () => {
    const attachments = [{ id: "1" }];
    const result = normalizeMessageAttachments(attachments);
    assert.equal(result[0].name, "attachment");
    assert.equal(result[0].content_type, "file");
  });
});
