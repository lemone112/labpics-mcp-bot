function asFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function flattenExplainNodes(rawPlan) {
  const top = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const root = top?.Plan || null;
  const nodes = [];

  function walk(planNode) {
    if (!planNode || typeof planNode !== "object") return;
    nodes.push({
      node_type: String(planNode["Node Type"] || "unknown"),
      relation_name: planNode["Relation Name"] || null,
      index_name: planNode["Index Name"] || null,
      plan_rows: asFiniteNumber(planNode["Plan Rows"], 0),
      total_cost: asFiniteNumber(planNode["Total Cost"], 0),
    });
    const children = Array.isArray(planNode.Plans) ? planNode.Plans : [];
    for (const child of children) walk(child);
  }

  walk(root);
  return nodes;
}

export function evaluatePlanShape(queryKey, planNodes, shapeRule = {}) {
  const failures = [];
  const nodes = Array.isArray(planNodes) ? planNodes : [];
  const requiredNodeTypes = Array.isArray(shapeRule.required_any_node_types)
    ? shapeRule.required_any_node_types.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const requiredIndexPrefixes = Array.isArray(shapeRule.required_index_name_prefixes)
    ? shapeRule.required_index_name_prefixes.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const forbiddenSeqScanRelations = new Set(
    (Array.isArray(shapeRule.forbidden_seq_scan_relations) ? shapeRule.forbidden_seq_scan_relations : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean)
  );
  const seqScanMinPlanRows = asFiniteNumber(shapeRule.seq_scan_min_plan_rows, 1000);

  if (requiredNodeTypes.length > 0) {
    const hasRequiredNodeType = nodes.some((node) => requiredNodeTypes.includes(node.node_type));
    if (!hasRequiredNodeType) {
      failures.push(
        `[plan] query ${queryKey} missing required node type (${requiredNodeTypes.join(", ")})`
      );
    }
  }

  if (requiredIndexPrefixes.length > 0) {
    const hasRequiredIndex = nodes.some((node) => {
      if (typeof node.index_name !== "string" || node.index_name.length === 0) return false;
      return requiredIndexPrefixes.some((prefix) => node.index_name.startsWith(prefix));
    });
    if (!hasRequiredIndex) {
      failures.push(
        `[plan] query ${queryKey} missing required index prefix (${requiredIndexPrefixes.join(", ")})`
      );
    }
  }

  for (const node of nodes) {
    if (node.node_type !== "Seq Scan") continue;
    if (!forbiddenSeqScanRelations.has(String(node.relation_name || ""))) continue;
    if (node.plan_rows < seqScanMinPlanRows) continue;
    failures.push(
      `[plan] query ${queryKey} has forbidden Seq Scan on ${node.relation_name} (plan_rows=${node.plan_rows}, threshold=${seqScanMinPlanRows})`
    );
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}
