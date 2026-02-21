import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vectorLiteral, withTransaction } from "../src/infra/db.js";

describe("vectorLiteral", () => {
  it("converts array of numbers to PostgreSQL vector literal", () => {
    assert.equal(vectorLiteral([1, 2, 3]), "[1,2,3]");
  });

  it("handles floating point numbers", () => {
    assert.equal(vectorLiteral([0.1, 0.2, 0.3]), "[0.1,0.2,0.3]");
  });

  it("replaces NaN with 0", () => {
    assert.equal(vectorLiteral([1, NaN, 3]), "[1,0,3]");
  });

  it("handles non-numeric strings in array as 0", () => {
    assert.equal(vectorLiteral(["a", "b"]), "[0,0]");
  });

  it("handles empty array", () => {
    assert.equal(vectorLiteral([]), "[]");
  });

  it("handles non-array input gracefully", () => {
    assert.equal(vectorLiteral(null), "[]");
    assert.equal(vectorLiteral(undefined), "[]");
    assert.equal(vectorLiteral("not array"), "[]");
    assert.equal(vectorLiteral(42), "[]");
  });
});

describe("withTransaction", () => {
  it("commits on success", async () => {
    const calls = [];
    const mockClient = {
      query: async (sql) => calls.push(sql),
      release: () => calls.push("release"),
    };
    const mockPool = {
      connect: async () => mockClient,
    };

    const result = await withTransaction(mockPool, async (client) => {
      await client.query("SELECT 1");
      return "done";
    });

    assert.equal(result, "done");
    assert.deepStrictEqual(calls, ["BEGIN", "SELECT 1", "COMMIT", "release"]);
  });

  it("rolls back on error", async () => {
    const calls = [];
    const mockClient = {
      query: async (sql) => calls.push(sql),
      release: () => calls.push("release"),
    };
    const mockPool = {
      connect: async () => mockClient,
    };

    await assert.rejects(
      () =>
        withTransaction(mockPool, async () => {
          throw new Error("test error");
        }),
      { message: "test error" }
    );

    assert.deepStrictEqual(calls, ["BEGIN", "ROLLBACK", "release"]);
  });

  it("always releases client even on rollback error", async () => {
    let released = false;
    const mockClient = {
      query: async (sql) => {
        if (sql === "ROLLBACK") throw new Error("rollback failed");
      },
      release: () => { released = true; },
    };
    const mockPool = { connect: async () => mockClient };

    await assert.rejects(
      () =>
        withTransaction(mockPool, async () => {
          throw new Error("original");
        }),
    );

    assert.ok(released);
  });
});
