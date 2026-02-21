import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePlanShape, flattenExplainNodes } from "../scripts/perf-plan-regression.mjs";

test("flattenExplainNodes flattens nested EXPLAIN tree", () => {
  const rawPlan = [
    {
      Plan: {
        "Node Type": "Limit",
        Plans: [
          {
            "Node Type": "Index Scan",
            "Relation Name": "employees",
            "Index Name": "employees_scope_status_updated_cover_idx",
            "Plan Rows": 120,
          },
        ],
      },
    },
  ];

  const nodes = flattenExplainNodes(rawPlan);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].node_type, "Limit");
  assert.equal(nodes[1].node_type, "Index Scan");
  assert.equal(nodes[1].relation_name, "employees");
  assert.equal(nodes[1].index_name, "employees_scope_status_updated_cover_idx");
});

test("evaluatePlanShape validates required node and index prefix", () => {
  const planNodes = [
    { node_type: "Limit", relation_name: null, index_name: null, plan_rows: 50 },
    {
      node_type: "Index Scan",
      relation_name: "employees",
      index_name: "employees_scope_status_updated_cover_idx",
      plan_rows: 50,
    },
  ];

  const result = evaluatePlanShape("workforce_employee_lookup", planNodes, {
    required_any_node_types: ["Index Scan", "Index Only Scan"],
    required_index_name_prefixes: ["employees_scope_status_updated_cover_idx"],
    forbidden_seq_scan_relations: ["employees"],
    seq_scan_min_plan_rows: 100,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("evaluatePlanShape fails on forbidden seq scan above threshold", () => {
  const planNodes = [
    {
      node_type: "Seq Scan",
      relation_name: "client_executor_links",
      index_name: null,
      plan_rows: 1200,
    },
  ];

  const result = evaluatePlanShape("graph_links_active_by_project", planNodes, {
    forbidden_seq_scan_relations: ["client_executor_links"],
    seq_scan_min_plan_rows: 500,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /forbidden Seq Scan/);
});

test("evaluatePlanShape ignores small seq scan below threshold", () => {
  const planNodes = [
    {
      node_type: "Seq Scan",
      relation_name: "employee_conditions",
      index_name: null,
      plan_rows: 50,
    },
  ];

  const result = evaluatePlanShape("workforce_conditions_timeline", planNodes, {
    forbidden_seq_scan_relations: ["employee_conditions"],
    seq_scan_min_plan_rows: 500,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("evaluatePlanShape fails when required node type is missing", () => {
  const planNodes = [{ node_type: "Seq Scan", relation_name: "employees", index_name: null, plan_rows: 50 }];

  const result = evaluatePlanShape("workforce_employee_lookup", planNodes, {
    required_any_node_types: ["Index Scan", "Index Only Scan"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /missing required node type/);
});

test("evaluatePlanShape fails when required index prefix is missing", () => {
  const planNodes = [
    {
      node_type: "Index Scan",
      relation_name: "employee_conditions",
      index_name: "employee_conditions_employee_effective_idx",
      plan_rows: 80,
    },
  ];

  const result = evaluatePlanShape("workforce_conditions_timeline", planNodes, {
    required_index_name_prefixes: ["employee_conditions_employee_effective_cover_idx"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /missing required index prefix/);
});

test("index pack migration and perf plan-shapes config are present", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const migrationSource = readFileSync(
    join(currentDir, "..", "db", "migrations", "0043_workforce_metrics_index_pack.sql"),
    "utf8"
  );
  const budgets = JSON.parse(
    readFileSync(join(currentDir, "..", "perf", "perf-budgets.json"), "utf8")
  );

  const expectedIndexes = [
    "employees_scope_status_updated_cover_idx",
    "employee_conditions_employee_effective_cover_idx",
    "client_executor_links_active_project_scope_priority_idx",
    "metric_observations_scope_project_observed_cover_idx",
  ];
  for (const indexName of expectedIndexes) {
    assert.ok(migrationSource.includes(indexName), `Expected index ${indexName} in migration 0043`);
  }

  assert.ok(budgets.plan_shapes, "Expected plan_shapes section in perf-budgets.json");
  assert.ok(
    budgets.plan_shapes.workforce_employee_lookup,
    "Expected plan_shapes.workforce_employee_lookup to be configured"
  );
});
