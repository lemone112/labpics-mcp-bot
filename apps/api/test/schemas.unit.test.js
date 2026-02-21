import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBody } from "../src/infra/api-contract.js";
import {
  LoginSchema,
  CreateProjectSchema,
  CreateAccountSchema,
  CreateOpportunitySchema,
  UpdateStageSchema,
  CreateOfferSchema,
  ApproveOfferSchema,
  CreateOutboundDraftSchema,
  OptOutSchema,
  LightRagQuerySchema,
  LightRagFeedbackSchema,
  SearchSchema,
} from "../src/infra/schemas.js";

describe("parseBody", () => {
  it("throws ApiError on invalid input", () => {
    assert.throws(
      () => parseBody(LoginSchema, {}),
      (err) => err.name === "ApiError" && err.status === 400 && err.code === "validation_error" && Array.isArray(err.details)
    );
  });

  it("returns parsed data on valid input", () => {
    const result = parseBody(LoginSchema, { username: "admin", password: "secret" });
    assert.equal(result.username, "admin");
    assert.equal(result.password, "secret");
  });

  it("treats null/undefined body as empty object", () => {
    assert.throws(
      () => parseBody(LoginSchema, null),
      (err) => err.status === 400
    );
  });
});

describe("LoginSchema", () => {
  it("trims username", () => {
    const result = parseBody(LoginSchema, { username: "  admin  ", password: "pass" });
    assert.equal(result.username, "admin");
  });

  it("rejects empty password", () => {
    assert.throws(
      () => parseBody(LoginSchema, { username: "admin", password: "" }),
      (err) => err.status === 400
    );
  });
});

describe("CreateProjectSchema", () => {
  it("accepts valid input with defaults", () => {
    const result = parseBody(CreateProjectSchema, { name: "Test Project" });
    assert.equal(result.name, "Test Project");
    assert.equal(result.account_scope_name, "Project account scope");
    assert.equal(result.account_scope_key, null);
  });

  it("rejects name shorter than 2 chars", () => {
    assert.throws(
      () => parseBody(CreateProjectSchema, { name: "A" }),
      (err) => err.status === 400
    );
  });
});

describe("CreateAccountSchema", () => {
  it("accepts valid input with defaults", () => {
    const result = parseBody(CreateAccountSchema, { name: "Acme Corp" });
    assert.equal(result.name, "Acme Corp");
    assert.equal(result.stage, "prospect");
    assert.equal(result.domain, null);
    assert.deepEqual(result.evidence_refs, []);
  });

  it("rejects short name", () => {
    assert.throws(
      () => parseBody(CreateAccountSchema, { name: "A" }),
      (err) => err.status === 400
    );
  });
});

describe("CreateOpportunitySchema", () => {
  it("accepts valid input", () => {
    const result = parseBody(CreateOpportunitySchema, {
      title: "Big Deal",
      account_id: "acc-123",
      next_step: "Follow up call",
      probability: 0.5,
      amount_estimate: 50000,
    });
    assert.equal(result.title, "Big Deal");
    assert.equal(result.account_id, "acc-123");
    assert.equal(result.stage, "discovery");
    assert.equal(result.probability, 0.5);
    assert.equal(result.amount_estimate, 50000);
  });

  it("rejects missing account_id", () => {
    assert.throws(
      () => parseBody(CreateOpportunitySchema, { title: "Deal", next_step: "Do something" }),
      (err) => err.status === 400
    );
  });

  it("rejects short next_step", () => {
    assert.throws(
      () => parseBody(CreateOpportunitySchema, { title: "Deal", account_id: "a", next_step: "ab" }),
      (err) => err.status === 400
    );
  });
});

describe("UpdateStageSchema", () => {
  it("accepts valid stage", () => {
    const result = parseBody(UpdateStageSchema, { stage: "Won" });
    assert.equal(result.stage, "won");
    assert.equal(result.reason, null);
  });

  it("rejects empty stage", () => {
    assert.throws(
      () => parseBody(UpdateStageSchema, { stage: "" }),
      (err) => err.status === 400
    );
  });
});

describe("CreateOfferSchema", () => {
  it("accepts valid input with defaults", () => {
    const result = parseBody(CreateOfferSchema, { title: "Offer #1" });
    assert.equal(result.title, "Offer #1");
    assert.equal(result.currency, "USD");
    assert.equal(result.subtotal, 0);
    assert.equal(result.discount_pct, 0);
  });

  it("rejects discount above 100", () => {
    assert.throws(
      () => parseBody(CreateOfferSchema, { title: "Offer", discount_pct: 150 }),
      (err) => err.status === 400
    );
  });
});

describe("ApproveOfferSchema", () => {
  it("accepts empty body", () => {
    const result = parseBody(ApproveOfferSchema, {});
    assert.equal(result.comment, null);
    assert.deepEqual(result.evidence_refs, []);
  });

  it("accepts comment", () => {
    const result = parseBody(ApproveOfferSchema, { comment: "Looks good" });
    assert.equal(result.comment, "Looks good");
  });
});

describe("CreateOutboundDraftSchema", () => {
  it("accepts valid draft", () => {
    const result = parseBody(CreateOutboundDraftSchema, {
      channel: "email",
      recipient_ref: "user@example.com",
      idempotency_key: "key-123",
    });
    assert.equal(result.channel, "email");
    assert.equal(result.recipient_ref, "user@example.com");
    assert.equal(result.max_retries, 5);
  });

  it("rejects invalid channel", () => {
    assert.throws(
      () => parseBody(CreateOutboundDraftSchema, {
        channel: "sms",
        recipient_ref: "user",
        idempotency_key: "key",
      }),
      (err) => err.status === 400
    );
  });
});

describe("OptOutSchema", () => {
  it("accepts valid opt-out", () => {
    const result = parseBody(OptOutSchema, {
      contact_global_id: "cg-123",
      channel: "telegram",
      opted_out: true,
    });
    assert.equal(result.contact_global_id, "cg-123");
    assert.equal(result.channel, "telegram");
    assert.equal(result.opted_out, true);
  });

  it("rejects invalid channel", () => {
    assert.throws(
      () => parseBody(OptOutSchema, { contact_global_id: "cg-1", channel: "whatsapp" }),
      (err) => err.status === 400
    );
  });
});

describe("LightRagQuerySchema", () => {
  it("accepts query with defaults", () => {
    const result = parseBody(LightRagQuerySchema, { query: "test query" });
    assert.equal(result.query, "test query");
    assert.equal(result.topK, 10);
    assert.equal(result.sourceFilter, null);
  });

  it("accepts sourceFilter array", () => {
    const result = parseBody(LightRagQuerySchema, {
      query: "search",
      sourceFilter: ["messages", "issues"],
    });
    assert.deepEqual(result.sourceFilter, ["messages", "issues"]);
  });

  it("accepts date range fields", () => {
    const result = parseBody(LightRagQuerySchema, {
      query: "search",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });
    assert.ok(result.date_from instanceof Date);
    assert.ok(result.date_to instanceof Date);
  });


  it("rejects inverted date range", () => {
    assert.throws(
      () => parseBody(LightRagQuerySchema, {
        query: "search",
        date_from: "2026-02-01",
        date_to: "2026-01-01",
      }),
      (err) => err.status === 400 && err.code === "validation_error"
    );
  });
  it("rejects empty query", () => {
    assert.throws(
      () => parseBody(LightRagQuerySchema, { query: "" }),
      (err) => err.status === 400
    );
  });
});

describe("LightRagFeedbackSchema", () => {
  it("accepts valid feedback", () => {
    const result = parseBody(LightRagFeedbackSchema, {
      query_run_id: 42,
      rating: -1,
    });
    assert.equal(result.query_run_id, 42);
    assert.equal(result.rating, -1);
    assert.equal(result.comment, null);
  });

  it("rejects invalid rating", () => {
    assert.throws(
      () => parseBody(LightRagFeedbackSchema, { query_run_id: 1, rating: 5 }),
      (err) => err.status === 400
    );
  });

  it("rejects non-positive query_run_id", () => {
    assert.throws(
      () => parseBody(LightRagFeedbackSchema, { query_run_id: 0, rating: 1 }),
      (err) => err.status === 400
    );
  });
});

describe("SearchSchema", () => {
  it("accepts valid search", () => {
    const result = parseBody(SearchSchema, { query: "hello world" });
    assert.equal(result.query, "hello world");
    assert.equal(result.topK, 10);
  });

  it("accepts search with optional date range", () => {
    const result = parseBody(SearchSchema, {
      query: "hello world",
      date_from: "2026-01-01",
      date_to: "2026-01-15",
    });
    assert.ok(result.date_from instanceof Date);
    assert.ok(result.date_to instanceof Date);
  });

  it("rejects inverted date range", () => {
    assert.throws(
      () => parseBody(SearchSchema, {
        query: "hello world",
        date_from: "2026-02-01",
        date_to: "2026-01-15",
      }),
      (err) => err.status === 400 && err.code === "validation_error"
    );
  });
});
