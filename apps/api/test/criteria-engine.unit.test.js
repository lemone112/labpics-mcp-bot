import test from "node:test";
import assert from "node:assert/strict";

import { evaluateCriteriaBatch, evaluateCriteriaDefinition } from "../src/domains/analytics/criteria-engine.ts";

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

test("criteria engine covers all comparison operators and between exclusivity", () => {
  const operatorCases = [
    { op: ">", metric: 11, threshold: 10, shouldPass: true },
    { op: ">=", metric: 10, threshold: 10, shouldPass: true },
    { op: "<", metric: 9, threshold: 10, shouldPass: true },
    { op: "<=", metric: 10, threshold: 10, shouldPass: true },
    { op: "==", metric: 10, threshold: 10, shouldPass: true },
    { op: "=", metric: 10, threshold: 10, shouldPass: true },
    { op: "!=", metric: 9, threshold: 10, shouldPass: true },
    { op: "!=", metric: 10, threshold: 10, shouldPass: false },
  ];

  for (const { op, metric, threshold, shouldPass } of operatorCases) {
    const result = evaluateCriteriaDefinition(
      {
        criteria_key: `ops.${op}.${metric}.${threshold}`,
        version: 1,
        severity: "low",
        rule_spec: {
          type: "metric_threshold",
          metric_key: "m",
          op,
          value: threshold,
        },
      },
      { metricValues: { m: metric } }
    );
    assert.equal(result.status, shouldPass ? "pass" : "fail");
  }

  const inclusive = evaluateCriteriaDefinition(
    {
      criteria_key: "between.inclusive",
      version: 1,
      severity: "medium",
      rule_spec: {
        type: "between",
        metric_key: "ratio",
        min: 1,
        max: 3,
      },
    },
    { metricValues: { ratio: 1 } }
  );
  assert.equal(inclusive.status, "pass");

  const exclusive = evaluateCriteriaDefinition(
    {
      criteria_key: "between.exclusive",
      version: 1,
      severity: "medium",
      rule_spec: {
        type: "between",
        metric_key: "ratio",
        min: 1,
        max: 3,
        inclusive: false,
      },
    },
    { metricValues: { ratio: 1 } }
  );
  assert.equal(exclusive.status, "fail");
});

test("criteria engine validates malformed definitions and rule edge cases", () => {
  const missingKey = evaluateCriteriaDefinition({
    criteria_key: "",
    version: 1,
    severity: "critical",
    rule_spec: { type: "constant", value: true },
  });
  assert.equal(missingKey.status, "error");
  assert.equal(missingKey.error, "criteria_key_required");

  const missingRule = evaluateCriteriaDefinition({
    criteria_key: "missing.rule",
    version: 1,
    severity: "critical",
    rule_spec: null,
  });
  assert.equal(missingRule.status, "error");
  assert.equal(missingRule.error, "rule_spec_required");

  const unknownSeverityFallback = evaluateCriteriaDefinition({
    criteria_key: "severity.fallback",
    version: 1,
    severity: "unknown-severity",
    rule_spec: { type: "constant", value: false },
  });
  assert.equal(unknownSeverityFallback.status, "fail");
  assert.equal(unknownSeverityFallback.score, 80);

  const errorCases = [
    {
      name: "not_condition_required",
      rule_spec: { type: "not" },
      context: {},
      expected: /not_condition_required/,
    },
    {
      name: "empty_logical_conditions_and",
      rule_spec: { type: "and", conditions: [] },
      context: {},
      expected: /empty_logical_conditions:and/,
    },
    {
      name: "empty_logical_conditions_or",
      rule_spec: { type: "or", conditions: [] },
      context: {},
      expected: /empty_logical_conditions:or/,
    },
    {
      name: "missing_threshold_ref",
      rule_spec: {
        type: "metric_threshold",
        metric_key: "a",
        op: ">",
        threshold_ref: "missing_threshold",
      },
      context: { metricValues: { a: 5 }, thresholds: {} },
      expected: /missing_threshold_ref/,
    },
    {
      name: "metric_value_missing",
      rule_spec: { type: "metric_threshold", metric_key: "a", op: ">", value: 1 },
      context: { metricValues: {} },
      expected: /metric_value_missing:a/,
    },
    {
      name: "invalid_between_range",
      rule_spec: { type: "between", metric_key: "a", min: "x", max: 1 },
      context: { metricValues: { a: 1 } },
      expected: /invalid_between_range:a/,
    },
    {
      name: "unsupported_condition_type",
      rule_spec: { type: "magic_rule" },
      context: {},
      expected: /unsupported_condition_type:magic_rule/,
    },
  ];

  for (const testCase of errorCases) {
    const result = evaluateCriteriaDefinition(
      {
        criteria_key: `edge.${testCase.name}`,
        version: 1,
        severity: "medium",
        rule_spec: testCase.rule_spec,
      },
      testCase.context
    );
    assert.equal(result.status, "error");
    assert.match(result.error || "", testCase.expected);
  }
});

test("criteria engine snapshot normalization keeps nested structures deterministic", () => {
  const result = evaluateCriteriaDefinition(
    {
      criteria_key: "snapshot.sorting",
      version: 1,
      severity: "low",
      rule_spec: { type: "constant", value: true },
    },
    {
      metricValues: {
        z: 1,
        a: { y: 2, x: [{ b: 2, a: 1 }, { d: 4, c: 3 }] },
      },
      thresholds: {
        t2: 2,
        t1: { k2: "v2", k1: "v1" },
      },
    }
  );

  assert.deepStrictEqual(result.metric_snapshot, {
    a: { x: [{ a: 1, b: 2 }, { c: 3, d: 4 }], y: 2 },
    z: 1,
  });
  assert.deepStrictEqual(result.threshold_snapshot, {
    t1: { k1: "v1", k2: "v2" },
    t2: 2,
  });
});
