import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessProject,
  getAccessibleProjectIds,
  getEffectiveRole,
  hasPermission,
  requirePermission,
  requireRole,
} from "../src/infra/rbac.js";

test("getEffectiveRole supports RBAC v2 roles and safe fallbacks", () => {
  assert.equal(getEffectiveRole({ auth: { user_role: "delivery_lead", user_id: "u-1" } }), "delivery_lead");
  assert.equal(getEffectiveRole({ auth: { user_role: "executor", user_id: "u-1" } }), "executor");
  assert.equal(getEffectiveRole({ auth: { user_role: "viewer", user_id: "u-1" } }), "viewer");

  // Unknown DB role for authenticated user falls back to pm (deny-by-default over owner).
  assert.equal(getEffectiveRole({ auth: { user_role: "unknown", user_id: "u-1" } }), "pm");

  // Legacy env-var session (no user_id) keeps owner fallback for backward compatibility.
  assert.equal(getEffectiveRole({ auth: { username: "legacy-owner" } }), "owner");
});

test("permission matrix enforces deny-by-default behavior", () => {
  assert.equal(hasPermission("owner", "api_keys.manage"), true);
  assert.equal(hasPermission("pm", "api_keys.manage"), false);
  assert.equal(hasPermission("delivery_lead", "workforce.condition.write"), true);
  assert.equal(hasPermission("delivery_lead", "user.manage"), false);
  assert.equal(hasPermission("executor", "workforce.condition.write"), false);
  assert.equal(hasPermission("viewer", "workforce.link.read"), true);
  assert.equal(hasPermission("viewer", "project.create"), false);
});

test("requirePermission rejects privilege escalation attempts", async () => {
  const checkApiKeysManage = requirePermission("api_keys.manage");
  await assert.rejects(
    () => checkApiKeysManage({ auth: { user_role: "pm", user_id: "u-1" } }),
    /Missing permission: api_keys\.manage/
  );

  const checkWorkforceRead = requirePermission("workforce.employee.read");
  await assert.doesNotReject(
    () => checkWorkforceRead({ auth: { user_role: "viewer", user_id: "u-1" } })
  );
});

test("requireRole applies role hierarchy with new roles", async () => {
  await assert.doesNotReject(
    () => requireRole("executor")({ auth: { user_role: "pm", user_id: "u-1" } })
  );
  await assert.rejects(
    () => requireRole("pm")({ auth: { user_role: "delivery_lead", user_id: "u-1" } }),
    /requires pm role/
  );
});

test("project access remains assignment-bound for non-owner roles", async () => {
  const pool = {
    query: async (_sql, params) => {
      const [_userId, projectId] = params;
      if (projectId === "project-allow") return { rows: [{ one: 1 }] };
      return { rows: [] };
    },
  };

  assert.equal(await canAccessProject(pool, "u-1", "delivery_lead", "project-allow"), true);
  assert.equal(await canAccessProject(pool, "u-1", "delivery_lead", "project-deny"), false);
  assert.equal(await canAccessProject(pool, "u-1", "viewer", "project-deny"), false);
  assert.equal(await canAccessProject(pool, "u-1", "owner", "project-deny"), true);
});

test("getAccessibleProjectIds keeps owner unrestricted and filters others", async () => {
  const pool = {
    query: async () => ({
      rows: [{ project_id: "p-1" }, { project_id: "p-2" }],
    }),
  };

  assert.equal(await getAccessibleProjectIds(pool, "u-1", "owner"), null);
  assert.deepEqual(await getAccessibleProjectIds(pool, "u-1", "executor"), ["p-1", "p-2"]);
});
