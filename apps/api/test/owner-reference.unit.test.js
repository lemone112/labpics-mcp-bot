import test from "node:test";
import assert from "node:assert/strict";

import { resolveOwnerReference } from "../src/domains/core/owner-reference.js";

function createPool({ usersById = {}, usersByUsername = {} } = {}) {
  return {
    query: async (sql, params) => {
      if (sql.includes("WHERE id = $1::uuid")) {
        const user = usersById[params[0]];
        return { rows: user ? [{ id: user.id, username: user.username }] : [] };
      }
      if (sql.includes("WHERE lower(username) = lower($1)")) {
        const key = String(params[0] || "").toLowerCase();
        const user = usersByUsername[key];
        return { rows: user ? [{ id: user.id, username: user.username }] : [] };
      }
      throw new Error(`Unexpected query in test pool: ${sql}`);
    },
  };
}

test("resolveOwnerReference resolves explicit owner_user_id first", async () => {
  const pool = createPool({
    usersById: { "u-1": { id: "u-1", username: "alice" } },
  });

  const resolved = await resolveOwnerReference(pool, {
    ownerUserId: "u-1",
    ownerUsername: "ignored",
    authUserId: "u-2",
    authUsername: "bob",
  });

  assert.deepEqual(resolved, {
    ownerUserId: "u-1",
    ownerUsername: "alice",
    source: "owner_user_id",
    resolved: true,
    invalidOwnerUserId: null,
  });
});

test("resolveOwnerReference marks explicit owner_user_id as invalid if user not found", async () => {
  const pool = createPool({
    usersByUsername: { alice: { id: "u-1", username: "alice" } },
  });

  const resolved = await resolveOwnerReference(pool, {
    ownerUserId: "missing-user",
    ownerUsername: "alice",
  });

  assert.equal(resolved.source, "owner_user_id");
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.invalidOwnerUserId, "missing-user");
  assert.equal(resolved.ownerUserId, null);
});

test("resolveOwnerReference resolves by owner_username", async () => {
  const pool = createPool({
    usersByUsername: { carol: { id: "u-3", username: "carol" } },
  });

  const resolved = await resolveOwnerReference(pool, { ownerUsername: "Carol" });

  assert.deepEqual(resolved, {
    ownerUserId: "u-3",
    ownerUsername: "carol",
    source: "owner_username",
    resolved: true,
    invalidOwnerUserId: null,
  });
});

test("resolveOwnerReference falls back to auth user identity", async () => {
  const pool = createPool({
    usersById: { "u-auth": { id: "u-auth", username: "dave" } },
  });

  const resolved = await resolveOwnerReference(pool, { authUserId: "u-auth" });
  assert.equal(resolved.ownerUserId, "u-auth");
  assert.equal(resolved.ownerUsername, "dave");
  assert.equal(resolved.source, "auth_user_id");
  assert.equal(resolved.resolved, true);
});

test("resolveOwnerReference keeps unresolved username for transitional compatibility", async () => {
  const pool = createPool();

  const resolved = await resolveOwnerReference(pool, { ownerUsername: "legacy-owner" });
  assert.equal(resolved.ownerUserId, null);
  assert.equal(resolved.ownerUsername, "legacy-owner");
  assert.equal(resolved.source, "owner_username");
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.invalidOwnerUserId, null);
});

test("resolveOwnerReference falls back to auth username lookup", async () => {
  const pool = createPool({
    usersByUsername: { erin: { id: "u-erin", username: "erin" } },
  });

  const resolved = await resolveOwnerReference(pool, { authUsername: "Erin" });
  assert.equal(resolved.ownerUserId, "u-erin");
  assert.equal(resolved.ownerUsername, "erin");
  assert.equal(resolved.source, "auth_username");
  assert.equal(resolved.resolved, true);
});

test("resolveOwnerReference returns none-source when no inputs provided", async () => {
  const pool = createPool();
  const resolved = await resolveOwnerReference(pool, {});
  assert.deepStrictEqual(resolved, {
    ownerUserId: null,
    ownerUsername: null,
    source: "none",
    resolved: false,
    invalidOwnerUserId: null,
  });
});
