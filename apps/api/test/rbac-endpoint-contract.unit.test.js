import test from "node:test";
import assert from "node:assert/strict";

import { registerUserRoutes } from "../src/routes/users.ts";

function createReply() {
  return {
    statusCode: 200,
    payload: null,
    code(status) {
      this.statusCode = status;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function createRouteRegistry() {
  const getHandlers = new Map();
  const postHandlers = new Map();
  return {
    registerGet: (path, handler) => getHandlers.set(path, handler),
    registerPost: (path, handler) => postHandlers.set(path, handler),
    getHandlers,
    postHandlers,
  };
}

test("GET /users contract: owner allowed, other roles denied", async () => {
  const registry = createRouteRegistry();
  const pool = {
    query: async (sql) => {
      if (sql.includes("FROM app_users")) {
        return {
          rows: [
            {
              id: "u-1",
              username: "alice",
              role: "owner",
              email: "alice@example.local",
              project_count: 0,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  registerUserRoutes({
    registerGet: registry.registerGet,
    registerPost: registry.registerPost,
    pool,
  });

  const listUsers = registry.getHandlers.get("/users");
  assert.ok(listUsers, "users list handler must be registered");

  const ownerReply = createReply();
  await listUsers(
    {
      requestId: "r-owner",
      auth: { user_role: "owner", user_id: "u-owner", username: "owner" },
    },
    ownerReply
  );
  assert.equal(ownerReply.statusCode, 200);
  assert.equal(Array.isArray(ownerReply.payload?.users), true);
  assert.equal(ownerReply.payload?.users?.length, 1);

  for (const role of ["pm", "delivery_lead", "executor", "viewer"]) {
    const deniedReply = createReply();
    await listUsers(
      {
        requestId: `r-${role}`,
        auth: { user_role: role, user_id: `u-${role}`, username: role },
      },
      deniedReply
    );
    assert.equal(deniedReply.statusCode, 403, `${role} must be denied`);
    assert.equal(deniedReply.payload?.error, "forbidden");
  }
});
