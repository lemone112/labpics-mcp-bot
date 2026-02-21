import test from "node:test";
import assert from "node:assert/strict";

import { evaluateCriteriaBatch, evaluateCriteriaDefinition } from "../src/domains/analytics/criteria-engine.js";

test("criteria engine evaluates metric thresholds and severity scoring", () => {
  const definition = {
    criteria_key: "delivery.sla_response",
    version: 2,
    severity: "high",
    rule_spec: {
      type: "metric_threshold",
      metric_key: "avg_response_minutes",
      op: "<=",
      value: 30,
    },
  };

  const passResult = evaluateCriteriaDefinition(definition, {
    metricValues: { avg_response_minutes: 18 },
    evidence_refs: ["msg:1"],
  });
  assert.equal(passResult.status, "pass");
  assert.equal(passResult.score, 100);
  assert.match(passResult.reason, /avg_response_minutes <= 30/);
  assert.deepStrictEqual(passResult.metric_snapshot, { avg_response_minutes: 18 });

  const failResult = evaluateCriteriaDefinition(definition, {
    metricValues: { avg_response_minutes: 47 },
    evidence_refs: ["msg:2"],
  });
  assert.equal(failResult.status, "fail");
  assert.equal(failResult.score, 20);
});

test("criteria engine supports nested logical rules and threshold refs", () => {
  const definition = {
    criteria_key: "commercial.quality_gate",
    version: 1,
    severity: "medium",
    rule_spec: {
      type: "and",
      conditions: [
        {
          type: "metric_threshold",
          metric_key: "expected_revenue",
          op: ">=",
          threshold_ref: "target_revenue",
        },
        {
          type: "or",
          conditions: [
            { type: "between", metric_key: "gross_margin_pct", min: 20, max: 60 },
            { type: "metric_threshold", metric_key: "gross_margin_pct", op: ">=", value: 65 },
          ],
        },
      ],
    },
  };

  const result = evaluateCriteriaDefinition(definition, {
    metricValues: {
      expected_revenue: 12000,
      gross_margin_pct: 25,
    },
    thresholds: {
      target_revenue: 10000,
    },
  });
  assert.equal(result.status, "pass");
  assert.equal(result.score, 100);

  const failed = evaluateCriteriaDefinition(definition, {
    metricValues: {
      expected_revenue: 6000,
      gross_margin_pct: 15,
    },
    thresholds: {
      target_revenue: 10000,
    },
  });
  assert.equal(failed.status, "fail");
  assert.equal(failed.score, 40);
});

test("criteria engine returns explicit error payload for invalid rules", () => {
  const definition = {
    criteria_key: "invalid.rule",
    version: 1,
    severity: "critical",
    rule_spec: {
      type: "metric_threshold",
      metric_key: "x",
      op: "><",
      value: 1,
    },
  };

  const result = evaluateCriteriaDefinition(definition, {
    metricValues: { x: 1 },
  });

  assert.equal(result.status, "error");
  assert.equal(result.score, 0);
  assert.equal(result.reason, "evaluation_error");
  assert.match(result.error, /unsupported_operator/);
});

test("criteria engine batch evaluation is deterministic across runs", () => {
  const definitions = [
    {
      criteria_key: "b.criteria",
      version: 1,
      severity: "low",
      rule_spec: { type: "constant", value: true },
    },
    {
      criteria_key: "a.criteria",
      version: 3,
      severity: "critical",
      rule_spec: {
        type: "not",
        condition: {
          type: "metric_threshold",
          metric_key: "risk_score",
          op: ">",
          value: 70,
        },
      },
    },
  ];

  const context = {
    "a.criteria": { metricValues: { risk_score: 65 } },
    "b.criteria": { metricValues: { ignored: 1 } },
  };

  const baseline = evaluateCriteriaBatch(definitions, context);
  for (let i = 0; i < 5; i += 1) {
    const replay = evaluateCriteriaBatch(definitions, context);
    assert.deepStrictEqual(replay, baseline);
  }
  assert.deepStrictEqual(
    baseline.map((row) => row.criteria_key),
    ["a.criteria", "b.criteria"]
  );
});
