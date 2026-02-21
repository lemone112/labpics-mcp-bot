function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortObject(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableSortObject(value[key]);
    }
    return out;
  }
  return value;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compareNumbers(operator, left, right) {
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === "==" || operator === "=") return left === right;
  if (operator === "!=") return left !== right;
  throw new Error(`unsupported_operator:${operator}`);
}

function resolveThresholdValue(condition, thresholds) {
  if (condition.threshold_ref) {
    const key = String(condition.threshold_ref || "").trim();
    if (!key || !Object.prototype.hasOwnProperty.call(thresholds, key)) {
      throw new Error(`missing_threshold_ref:${key}`);
    }
    return thresholds[key];
  }
  return condition.value;
}

function evaluateCondition(condition, context) {
  const kind = String(condition?.type || "").trim().toLowerCase();
  if (!kind) throw new Error("condition_type_required");

  if (kind === "constant") {
    const passed = Boolean(condition.value);
    return {
      passed,
      reason: passed ? "constant(true)" : "constant(false)",
    };
  }

  if (kind === "metric_threshold") {
    const metricKey = String(condition.metric_key || "").trim();
    const operator = String(condition.op || "").trim();
    if (!metricKey) throw new Error("metric_key_required");
    if (!operator) throw new Error("operator_required");

    const metricValue = toNumber(context.metricValues?.[metricKey]);
    if (metricValue === null) throw new Error(`metric_value_missing:${metricKey}`);

    const expectedRaw = resolveThresholdValue(condition, context.thresholds || {});
    const expectedValue = toNumber(expectedRaw);
    if (expectedValue === null) throw new Error(`invalid_expected_value:${metricKey}`);

    const passed = compareNumbers(operator, metricValue, expectedValue);
    return {
      passed,
      reason: `${metricKey} ${operator} ${expectedValue} (actual=${metricValue})`,
    };
  }

  if (kind === "between") {
    const metricKey = String(condition.metric_key || "").trim();
    if (!metricKey) throw new Error("metric_key_required");
    const metricValue = toNumber(context.metricValues?.[metricKey]);
    if (metricValue === null) throw new Error(`metric_value_missing:${metricKey}`);
    const min = toNumber(condition.min);
    const max = toNumber(condition.max);
    if (min === null || max === null) throw new Error(`invalid_between_range:${metricKey}`);
    const inclusive = condition.inclusive !== false;
    const passed = inclusive ? metricValue >= min && metricValue <= max : metricValue > min && metricValue < max;
    return {
      passed,
      reason: `${metricKey} in ${inclusive ? "[" : "("}${min}, ${max}${inclusive ? "]" : ")"} (actual=${metricValue})`,
    };
  }

  if (kind === "and" || kind === "or") {
    if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
      throw new Error(`empty_logical_conditions:${kind}`);
    }
    const parts = [];
    const outcomes = [];
    for (const child of condition.conditions) {
      const result = evaluateCondition(child, context);
      outcomes.push(result.passed);
      parts.push(result.reason);
    }
    const passed = kind === "and" ? outcomes.every(Boolean) : outcomes.some(Boolean);
    return {
      passed,
      reason: `${kind}(${parts.join("; ")})`,
    };
  }

  if (kind === "not") {
    if (!condition.condition || typeof condition.condition !== "object") {
      throw new Error("not_condition_required");
    }
    const nested = evaluateCondition(condition.condition, context);
    return {
      passed: !nested.passed,
      reason: `not(${nested.reason})`,
    };
  }

  throw new Error(`unsupported_condition_type:${kind}`);
}

function severityFailScore(severity) {
  if (severity === "critical") return 0;
  if (severity === "high") return 20;
  if (severity === "medium") return 40;
  if (severity === "low") return 60;
  return 80;
}

export function evaluateCriteriaDefinition(definition, context = {}) {
  const criteriaKey = String(definition?.criteria_key || "").trim();
  const severity = String(definition?.severity || "medium").trim().toLowerCase();
  const version = Number(definition?.version || 1);
  const ruleSpec = definition?.rule_spec;

  const metricSnapshot = stableSortObject(context.metricValues || {});
  const thresholdSnapshot = stableSortObject(context.thresholds || {});
  const evidenceRefs = Array.isArray(context.evidence_refs) ? [...context.evidence_refs] : [];

  if (!criteriaKey) {
    return {
      criteria_key: "",
      version,
      status: "error",
      score: 0,
      reason: "criteria_key_required",
      metric_snapshot: metricSnapshot,
      threshold_snapshot: thresholdSnapshot,
      evidence_refs: evidenceRefs,
      error: "criteria_key_required",
    };
  }

  if (!ruleSpec || typeof ruleSpec !== "object") {
    return {
      criteria_key: criteriaKey,
      version,
      status: "error",
      score: 0,
      reason: "rule_spec_required",
      metric_snapshot: metricSnapshot,
      threshold_snapshot: thresholdSnapshot,
      evidence_refs: evidenceRefs,
      error: "rule_spec_required",
    };
  }

  try {
    const decision = evaluateCondition(ruleSpec, {
      metricValues: context.metricValues || {},
      thresholds: context.thresholds || {},
    });
    const status = decision.passed ? "pass" : "fail";
    return {
      criteria_key: criteriaKey,
      version,
      status,
      score: decision.passed ? 100 : severityFailScore(severity),
      reason: decision.reason,
      metric_snapshot: metricSnapshot,
      threshold_snapshot: thresholdSnapshot,
      evidence_refs: evidenceRefs,
      error: null,
    };
  } catch (error) {
    return {
      criteria_key: criteriaKey,
      version,
      status: "error",
      score: 0,
      reason: "evaluation_error",
      metric_snapshot: metricSnapshot,
      threshold_snapshot: thresholdSnapshot,
      evidence_refs: evidenceRefs,
      error: String(error?.message || error),
    };
  }
}

export function evaluateCriteriaBatch(criteriaDefinitions, contextByCriteriaKey) {
  const sortedDefs = [...(criteriaDefinitions || [])].sort((a, b) =>
    String(a?.criteria_key || "").localeCompare(String(b?.criteria_key || ""))
  );
  return sortedDefs.map((definition) => {
    const key = String(definition?.criteria_key || "");
    const ctx = (contextByCriteriaKey && contextByCriteriaKey[key]) || {};
    return evaluateCriteriaDefinition(definition, ctx);
  });
}
