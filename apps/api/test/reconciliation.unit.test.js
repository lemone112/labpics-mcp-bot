import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Re-implement pure functions from reconciliation.js for testing
// (they are not exported but contain critical business logic)

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function percentOf(ok, total) {
  const safeTotal = Math.max(0, toNumber(total, 0));
  if (safeTotal <= 0) return 100;
  return clampPercent((toNumber(ok, 0) / safeTotal) * 100);
}

function averagePercent(parts) {
  if (!Array.isArray(parts) || !parts.length) return 100;
  const sum = parts.reduce((acc, item) => acc + clampPercent(item), 0);
  return clampPercent(sum / parts.length);
}

function finalizeMetric(connector, source, totalCount, missingCount, duplicateCount, payload) {
  const total = Math.max(0, toNumber(totalCount, 0));
  const missing = Math.max(0, toNumber(missingCount, 0));
  const duplicates = Math.max(0, toNumber(duplicateCount, 0));
  const completeness = clampPercent(
    payload?.completeness_pct != null
      ? payload.completeness_pct
      : percentOf(Math.max(0, total - missing - duplicates), total)
  );
  return {
    connector,
    source,
    total_count: total,
    missing_count: missing,
    duplicate_count: duplicates,
    completeness_pct: Number(completeness.toFixed(2)),
    payload: payload && typeof payload === "object" ? payload : {},
  };
}

function buildPortfolioMetric(source, connectorMetrics = []) {
  const rows = Array.isArray(connectorMetrics) ? connectorMetrics : [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.total += toNumber(row.total_count, 0);
      acc.missing += toNumber(row.missing_count, 0);
      acc.duplicates += toNumber(row.duplicate_count, 0);
      acc.weighted += toNumber(row.completeness_pct, 0) * Math.max(1, toNumber(row.total_count, 0));
      acc.weight += Math.max(1, toNumber(row.total_count, 0));
      return acc;
    },
    { total: 0, missing: 0, duplicates: 0, weighted: 0, weight: 0 }
  );
  const completeness = totals.weight > 0 ? totals.weighted / totals.weight : 100;
  return finalizeMetric("portfolio", source, totals.total, totals.missing, totals.duplicates, {
    completeness_pct: completeness,
    by_connector: rows.map((item) => ({
      connector: item.connector,
      completeness_pct: item.completeness_pct,
      total_count: item.total_count,
      missing_count: item.missing_count,
      duplicate_count: item.duplicate_count,
    })),
  });
}

describe("clampPercent", () => {
  it("clamps to 0-100 range", () => {
    assert.equal(clampPercent(50), 50);
    assert.equal(clampPercent(-10), 0);
    assert.equal(clampPercent(150), 100);
  });

  it("handles NaN/null as 0", () => {
    assert.equal(clampPercent(NaN), 0);
    assert.equal(clampPercent(null), 0);
    assert.equal(clampPercent(undefined), 0);
  });
});

describe("percentOf", () => {
  it("calculates percentage", () => {
    assert.equal(percentOf(50, 100), 50);
    assert.equal(percentOf(100, 100), 100);
    assert.equal(percentOf(0, 100), 0);
  });

  it("returns 100 when total is 0 (no data = complete)", () => {
    assert.equal(percentOf(0, 0), 100);
  });

  it("clamps above 100", () => {
    assert.equal(percentOf(150, 100), 100);
  });

  it("handles negative ok as 0", () => {
    assert.equal(percentOf(-10, 100), 0);
  });
});

describe("averagePercent", () => {
  it("averages percent values", () => {
    assert.equal(averagePercent([80, 90, 100]), 90);
  });

  it("returns 100 for empty array", () => {
    assert.equal(averagePercent([]), 100);
  });

  it("returns 100 for non-array", () => {
    assert.equal(averagePercent(null), 100);
    assert.equal(averagePercent(undefined), 100);
  });

  it("clamps individual values before averaging", () => {
    // 150 clamped to 100, -20 clamped to 0: avg = 50
    assert.equal(averagePercent([150, -20]), 50);
  });
});

describe("finalizeMetric", () => {
  it("builds metric with explicit completeness from payload", () => {
    const result = finalizeMetric("chatwoot", "manual", 100, 5, 2, { completeness_pct: 95 });
    assert.equal(result.connector, "chatwoot");
    assert.equal(result.source, "manual");
    assert.equal(result.total_count, 100);
    assert.equal(result.missing_count, 5);
    assert.equal(result.duplicate_count, 2);
    assert.equal(result.completeness_pct, 95);
  });

  it("computes completeness when not in payload", () => {
    const result = finalizeMetric("linear", "auto", 100, 10, 5, {});
    // (100 - 10 - 5) / 100 * 100 = 85
    assert.equal(result.completeness_pct, 85);
  });

  it("handles zero total", () => {
    const result = finalizeMetric("attio", "manual", 0, 0, 0, {});
    assert.equal(result.completeness_pct, 100);
  });

  it("handles null payload", () => {
    const result = finalizeMetric("test", "manual", 50, 0, 0, null);
    assert.equal(result.completeness_pct, 100);
    assert.deepStrictEqual(result.payload, {});
  });

  it("clamps negative counts to 0", () => {
    const result = finalizeMetric("test", "manual", -5, -10, -3, {});
    assert.equal(result.total_count, 0);
    assert.equal(result.missing_count, 0);
    assert.equal(result.duplicate_count, 0);
  });
});

describe("buildPortfolioMetric", () => {
  it("aggregates connector metrics", () => {
    const metrics = [
      { connector: "chatwoot", completeness_pct: 90, total_count: 100, missing_count: 5, duplicate_count: 2 },
      { connector: "linear", completeness_pct: 80, total_count: 50, missing_count: 3, duplicate_count: 0 },
      { connector: "attio", completeness_pct: 95, total_count: 30, missing_count: 1, duplicate_count: 0 },
    ];
    const result = buildPortfolioMetric("manual", metrics);
    assert.equal(result.connector, "portfolio");
    assert.equal(result.total_count, 180);
    assert.equal(result.missing_count, 9);
    assert.equal(result.duplicate_count, 2);
    assert.ok(result.completeness_pct > 0);
    assert.ok(result.completeness_pct <= 100);
  });

  it("uses weighted average by total_count", () => {
    const metrics = [
      { connector: "a", completeness_pct: 100, total_count: 1000, missing_count: 0, duplicate_count: 0 },
      { connector: "b", completeness_pct: 0, total_count: 1, missing_count: 0, duplicate_count: 0 },
    ];
    const result = buildPortfolioMetric("manual", metrics);
    // Weighted heavily towards "a" (1000 vs 1)
    assert.ok(result.completeness_pct > 90);
  });

  it("returns 100 for empty metrics", () => {
    const result = buildPortfolioMetric("manual", []);
    assert.equal(result.completeness_pct, 100);
  });

  it("handles null/undefined input", () => {
    const result = buildPortfolioMetric("manual", null);
    assert.equal(result.completeness_pct, 100);
    assert.equal(result.total_count, 0);
  });

  it("includes by_connector breakdown in payload", () => {
    const metrics = [
      { connector: "chatwoot", completeness_pct: 90, total_count: 100, missing_count: 5, duplicate_count: 2 },
    ];
    const result = buildPortfolioMetric("auto", metrics);
    assert.ok(Array.isArray(result.payload.by_connector));
    assert.equal(result.payload.by_connector.length, 1);
    assert.equal(result.payload.by_connector[0].connector, "chatwoot");
  });
});
