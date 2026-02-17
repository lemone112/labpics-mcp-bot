import test from "node:test";
import assert from "node:assert/strict";

import {
  getTemplateByKey,
  buildSuggestedTemplate,
  generateTemplate,
  KAG_TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
} from "../src/kag/templates/index.js";

// ---------------------------------------------------------------------------
// KAG_TEMPLATE_KEYS
// ---------------------------------------------------------------------------

test("KAG_TEMPLATE_KEYS has 5 entries", () => {
  const keys = Object.values(KAG_TEMPLATE_KEYS);
  assert.equal(keys.length, 5);
  assert.ok(keys.includes("waiting_on_client_follow_up"));
  assert.ok(keys.includes("scope_creep_change_request"));
  assert.ok(keys.includes("delivery_risk_escalation"));
  assert.ok(keys.includes("finance_risk_review"));
  assert.ok(keys.includes("upsell_offer_pitch"));
});

// ---------------------------------------------------------------------------
// DEFAULT_TEMPLATES
// ---------------------------------------------------------------------------

test("DEFAULT_TEMPLATES is frozen with 5 entries", () => {
  assert.equal(Object.keys(DEFAULT_TEMPLATES).length, 5);
  assert.ok(Object.isFrozen(DEFAULT_TEMPLATES));
});

// ---------------------------------------------------------------------------
// getTemplateByKey
// ---------------------------------------------------------------------------

test("getTemplateByKey returns body for each known key", () => {
  for (const key of Object.values(KAG_TEMPLATE_KEYS)) {
    const body = getTemplateByKey(key);
    assert.ok(body.length > 0, `template for ${key} should not be empty`);
  }
});

test("getTemplateByKey returns empty string for unknown key", () => {
  assert.equal(getTemplateByKey("nonexistent_template"), "");
});

// ---------------------------------------------------------------------------
// buildSuggestedTemplate — variable substitution
// ---------------------------------------------------------------------------

test("buildSuggestedTemplate replaces {{variables}}", () => {
  const result = buildSuggestedTemplate(KAG_TEMPLATE_KEYS.WAITING, {
    client_name: "Acme Corp",
    stage_name: "Design Review",
    waiting_days: "3.5",
  });
  assert.ok(result.includes("Acme Corp"));
  assert.ok(result.includes("Design Review"));
  assert.ok(result.includes("3.5"));
  assert.ok(!result.includes("{{client_name}}"));
  assert.ok(!result.includes("{{stage_name}}"));
});

test("buildSuggestedTemplate handles missing variables gracefully", () => {
  const result = buildSuggestedTemplate(KAG_TEMPLATE_KEYS.WAITING, {});
  // Empty strings in place of missing variables
  assert.ok(typeof result === "string");
  assert.ok(result.length > 0);
});

test("buildSuggestedTemplate returns empty for unknown key", () => {
  assert.equal(buildSuggestedTemplate("no_such_key", {}), "");
});

// ---------------------------------------------------------------------------
// generateTemplate without LLM
// ---------------------------------------------------------------------------

test("generateTemplate without llm returns fallback template", async () => {
  const result = await generateTemplate({
    templateKey: KAG_TEMPLATE_KEYS.SCOPE_CREEP,
    variables: { client_name: "TestCo", out_of_scope_count: 3 },
  });
  assert.ok(result.includes("TestCo"));
  assert.ok(result.includes("3"));
});

// ---------------------------------------------------------------------------
// generateTemplate with LLM mock
// ---------------------------------------------------------------------------

test("generateTemplate with LLM mock returns LLM result", async () => {
  const mockLlm = async () => "Custom LLM response";
  const result = await generateTemplate({
    templateKey: KAG_TEMPLATE_KEYS.FINANCE,
    variables: { client_name: "X" },
    llmGenerateTemplate: mockLlm,
  });
  assert.equal(result, "Custom LLM response");
});

test("generateTemplate with LLM returning empty falls back to static template", async () => {
  const mockLlm = async () => "";
  const result = await generateTemplate({
    templateKey: KAG_TEMPLATE_KEYS.FINANCE,
    variables: { client_name: "Y", burn_rate: "1.2", margin_risk_pct: "30" },
    llmGenerateTemplate: mockLlm,
  });
  assert.ok(result.includes("Y"), "should fall back to static template");
  assert.ok(result.length > 20);
});

test("generateTemplate with LLM returning null falls back to static template", async () => {
  const mockLlm = async () => null;
  const result = await generateTemplate({
    templateKey: KAG_TEMPLATE_KEYS.UPSELL,
    variables: { client_name: "Z" },
    llmGenerateTemplate: mockLlm,
  });
  assert.ok(result.includes("Z"));
});

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

test("template rendering strips \\r from variable values", () => {
  const result = buildSuggestedTemplate(KAG_TEMPLATE_KEYS.WAITING, {
    client_name: "Test\r\nCorp",
    stage_name: "Phase 1",
    waiting_days: "2",
  });
  assert.ok(!result.includes("\r"), "\\r should be stripped");
  assert.ok(result.includes("Test\nCorp"));
});
