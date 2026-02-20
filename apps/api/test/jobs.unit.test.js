import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Test the storage budget calculation logic from jobs.js

function computeStorageUsage(databaseBytes, budgetGb) {
  const budgetGbRaw = Number.parseFloat(budgetGb || "20");
  const safeBudgetGb = Number.isFinite(budgetGbRaw) && budgetGbRaw > 0 ? budgetGbRaw : 20;
  const budgetBytes = Math.floor(safeBudgetGb * 1024 * 1024 * 1024);
  const usagePercent = Number(((databaseBytes / Math.max(1, budgetBytes)) * 100).toFixed(2));
  return { budgetBytes, usagePercent };
}

describe("storage budget calculation", () => {
  it("computes usage percent with default 20 GB budget", () => {
    const dbBytes = 10 * 1024 * 1024 * 1024; // 10 GB
    const { budgetBytes, usagePercent } = computeStorageUsage(dbBytes, "20");
    assert.equal(budgetBytes, 20 * 1024 * 1024 * 1024);
    assert.equal(usagePercent, 50);
  });

  it("handles custom budget", () => {
    const dbBytes = 5 * 1024 * 1024 * 1024; // 5 GB
    const { budgetBytes, usagePercent } = computeStorageUsage(dbBytes, "10");
    assert.equal(budgetBytes, 10 * 1024 * 1024 * 1024);
    assert.equal(usagePercent, 50);
  });

  it("falls back to 20 GB for invalid budget", () => {
    const dbBytes = 1024;
    const { budgetBytes } = computeStorageUsage(dbBytes, "invalid");
    assert.equal(budgetBytes, 20 * 1024 * 1024 * 1024);
  });

  it("falls back to 20 GB for zero budget", () => {
    const { budgetBytes } = computeStorageUsage(0, "0");
    assert.equal(budgetBytes, 20 * 1024 * 1024 * 1024);
  });

  it("falls back to 20 GB for negative budget", () => {
    const { budgetBytes } = computeStorageUsage(0, "-5");
    assert.equal(budgetBytes, 20 * 1024 * 1024 * 1024);
  });

  it("handles zero database size", () => {
    const { usagePercent } = computeStorageUsage(0, "20");
    assert.equal(usagePercent, 0);
  });

  it("handles over-budget scenario", () => {
    const dbBytes = 30 * 1024 * 1024 * 1024; // 30 GB
    const { usagePercent } = computeStorageUsage(dbBytes, "20");
    assert.equal(usagePercent, 150);
  });
});

// Test RAG counts aggregation pattern
describe("RAG counts aggregation", () => {
  function aggregateRagCounts(rows) {
    const ragCounts = { pending: 0, processing: 0, ready: 0, failed: 0 };
    for (const row of rows) {
      ragCounts[row.embedding_status] = row.count;
    }
    return ragCounts;
  }

  it("aggregates embedding status counts", () => {
    const rows = [
      { embedding_status: "pending", count: 10 },
      { embedding_status: "ready", count: 500 },
      { embedding_status: "failed", count: 2 },
    ];
    const result = aggregateRagCounts(rows);
    assert.deepStrictEqual(result, { pending: 10, processing: 0, ready: 500, failed: 2 });
  });

  it("returns zeros for empty input", () => {
    const result = aggregateRagCounts([]);
    assert.deepStrictEqual(result, { pending: 0, processing: 0, ready: 0, failed: 0 });
  });

  it("handles unknown status gracefully", () => {
    const rows = [
      { embedding_status: "ready", count: 100 },
      { embedding_status: "unknown", count: 5 },
    ];
    const result = aggregateRagCounts(rows);
    assert.equal(result.ready, 100);
    // unknown status creates a new key (doesn't crash)
    assert.equal(result.unknown, 5);
  });
});
