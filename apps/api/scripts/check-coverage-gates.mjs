import { readFileSync } from "node:fs";

const summaryPath = process.env.COVERAGE_SUMMARY_PATH || "coverage/coverage-summary.json";

/**
 * Conservative baseline gate:
 * - protects against regression while the suite is still expanding
 * - enforces stronger checks on security-critical infra modules
 */
const TOTAL_MIN = {
  lines: 17,
  statements: 17,
  functions: 21,
  branches: 83,
};

const CRITICAL_FILE_MIN = {
  "src/infra/api-contract.ts": { lines: 85, branches: 70 },
  "src/infra/utils.ts": { lines: 95, branches: 90 },
  "src/infra/http.ts": { lines: 75, branches: 70 },
  "src/infra/rbac.ts": { lines: 55 },
  "src/infra/scope.ts": { lines: 100 },
  "src/infra/schemas.ts": { lines: 100 },
};

function getPct(entry, metric) {
  return Number(entry?.[metric]?.pct ?? 0);
}

function findEntryBySuffix(summary, suffix) {
  const keys = Object.keys(summary).filter((k) => k !== "total");
  const matches = keys.filter((key) => key.endsWith(suffix));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Ambiguous coverage entry for suffix "${suffix}": ${matches.join(", ")}`);
  }
  return summary[matches[0]];
}

function assertThreshold(name, actual, min, failures) {
  if (actual < min) {
    failures.push(`${name}: expected >= ${min.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}

function main() {
  const raw = readFileSync(summaryPath, "utf8");
  const summary = JSON.parse(raw);
  const failures = [];

  for (const [metric, min] of Object.entries(TOTAL_MIN)) {
    const actual = getPct(summary.total, metric);
    assertThreshold(`total.${metric}`, actual, min, failures);
  }

  for (const [suffix, metrics] of Object.entries(CRITICAL_FILE_MIN)) {
    const entry = findEntryBySuffix(summary, suffix);
    if (!entry) {
      failures.push(`missing coverage entry for critical file "${suffix}"`);
      continue;
    }
    for (const [metric, min] of Object.entries(metrics)) {
      const actual = getPct(entry, metric);
      assertThreshold(`${suffix}.${metric}`, actual, min, failures);
    }
  }

  if (failures.length > 0) {
    console.error("Coverage gate failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Coverage gate passed.");
  console.log(
    JSON.stringify(
      {
        total: {
          lines: getPct(summary.total, "lines"),
          statements: getPct(summary.total, "statements"),
          functions: getPct(summary.total, "functions"),
          branches: getPct(summary.total, "branches"),
        },
      },
      null,
      2
    )
  );
}

main();
