import test from "node:test";
import assert from "node:assert/strict";

import {
  cronMatches,
  createReportGenerationHandler,
  runScheduledReports,
} from "../src/domains/analytics/report-scheduler.js";

test("cronMatches supports exact values, ranges, lists, and steps", () => {
  const date = new Date("2026-02-16T12:30:00.000Z"); // Monday
  const stepDate = new Date("2026-02-16T12:15:00.000Z");

  assert.equal(cronMatches("30 12 16 2 1", date), true);
  assert.equal(cronMatches("*/15 * * * *", stepDate), true);
  assert.equal(cronMatches("10-20/5 12 * * 1", stepDate), true);
  assert.equal(cronMatches("0,15,30,45 12 * * 1", date), true);
  assert.equal(cronMatches("31 12 * * *", date), false);
});

test("cronMatches rejects invalid expressions and out-of-range values", () => {
  const date = new Date("2026-02-16T12:30:00.000Z");
  assert.equal(cronMatches("", date), false);
  assert.equal(cronMatches("*/0 * * * *", date), false);
  assert.equal(cronMatches("61 * * * *", date), false);
  assert.equal(cronMatches("1 2 3 4", date), false);
  assert.equal(cronMatches("5-1 * * * *", date), false);
});

test("cronMatches covers additional step/range rejection branches", () => {
  const date = new Date("2026-02-16T12:30:00.000Z");
  assert.equal(cronMatches("foo/5 * * * *", date), false); // unsupported step format
  assert.equal(cronMatches("a-b/5 * * * *", date), false); // invalid range numbers in step
  assert.equal(cronMatches("70-80/5 * * * *", date), false); // step range out of bounds
  assert.equal(cronMatches("20-10/5 * * * *", date), false); // reversed step range
  assert.equal(cronMatches("10-20/5 * * * *", date), false); // value outside step range
  assert.equal(cronMatches("a-b * * * *", date), false); // invalid simple range
  assert.equal(cronMatches("70-80 * * * *", date), false); // simple range out of bounds
  assert.equal(cronMatches("not-a-number * * * *", date), false); // invalid exact numeric token
});

test("runScheduledReports handles success, recent-skip, cron-skip, and failure paths", async () => {
  const scope = {
    projectId: "11111111-1111-4111-8111-111111111111",
    accountScopeId: "22222222-2222-4222-8222-222222222222",
  };
  const now = new Date("2026-02-16T12:30:00.000Z");
  const queryCalls = [];
  const pool = {
    query: async (sql, params) => {
      queryCalls.push({ sql: String(sql), params });
      const templateId = String(params?.[0] || "");
      if (templateId === "tpl-recent") return { rows: [{ id: "already-generated" }] };
      return { rows: [] };
    },
  };

  const infoLogs = [];
  const errorLogs = [];
  const logger = {
    info: (obj, msg) => infoLogs.push({ obj, msg }),
    error: (obj, msg) => errorLogs.push({ obj, msg }),
  };

  const generatedCalls = [];
  const result = await runScheduledReports(pool, scope, {
    now,
    logger,
    listTemplates: async () => [
      { id: "tpl-ok", name: "Daily", active: true, schedule: "30 12 * * *" },
      { id: "tpl-recent", name: "Already Generated", active: true, schedule: "30 12 * * *" },
      { id: "tpl-fail", name: "Weekly", active: true, schedule: "30 12 * * 1" },
      { id: "   ", name: "Invalid Id", active: true, schedule: "30 12 * * *" },
      { id: "tpl-skip-cron", name: "No Match", active: true, schedule: "0 1 * * *" },
      { id: "tpl-inactive", name: "Inactive", active: false, schedule: "30 12 * * *" },
    ],
    generateReport: async (_pool, _scope, template, dateStart, dateEnd) => {
      generatedCalls.push({ templateId: template.id, dateStart, dateEnd });
      if (template.id === "tpl-fail") {
        throw new Error("generation exploded");
      }
      return { id: `report-${template.id}` };
    },
  });

  assert.equal(result.generated, 1);
  assert.equal(result.errors, 1);
  assert.equal(result.details.length, 2);
  assert.deepStrictEqual(
    generatedCalls.map((x) => x.templateId),
    ["tpl-ok", "tpl-fail"]
  );
  assert.equal(infoLogs.length, 1);
  assert.equal(errorLogs.length, 1);
  assert.equal(queryCalls.length, 3, "only cron-matching templates should hit recent-check query");
  assert.ok(result.details.some((x) => x.template_id === "tpl-ok" && x.status === "completed"));
  assert.ok(result.details.some((x) => x.template_id === "tpl-fail" && x.status === "failed"));
});

test("createReportGenerationHandler delegates to runScheduledReports with injected deps", async () => {
  const scope = {
    projectId: "11111111-1111-4111-8111-111111111111",
    accountScopeId: "22222222-2222-4222-8222-222222222222",
  };
  const pool = {
    query: async () => ({ rows: [] }),
  };
  let generateCalled = 0;
  const handler = createReportGenerationHandler({
    listTemplates: async () => [{ id: "tpl-1", name: "One", active: true, schedule: "* * * * *" }],
    generateReport: async () => {
      generateCalled += 1;
      return { id: "report-1" };
    },
  });

  const result = await handler({
    pool,
    scope,
    logger: { info: () => undefined, error: () => undefined },
  });

  assert.equal(generateCalled, 1);
  assert.equal(result.generated, 1);
  assert.equal(result.errors, 0);
});

test("runScheduledReports works with logger object missing info/error methods", async () => {
  const scope = {
    projectId: "11111111-1111-4111-8111-111111111111",
    accountScopeId: "22222222-2222-4222-8222-222222222222",
  };
  const pool = { query: async () => ({ rows: [] }) };

  const result = await runScheduledReports(pool, scope, {
    logger: {},
    listTemplates: async () => [],
  });

  assert.equal(result.generated, 0);
  assert.equal(result.errors, 0);
  assert.deepStrictEqual(result.details, []);
});

test("createReportGenerationHandler uses default dependencies safely", async () => {
  const scope = {
    projectId: "11111111-1111-4111-8111-111111111111",
    accountScopeId: "22222222-2222-4222-8222-222222222222",
  };
  const pool = {
    query: async (sql) => {
      const text = String(sql);
      if (text.includes("FROM report_templates")) return { rows: [] };
      throw new Error(`Unexpected SQL in test pool: ${text.slice(0, 50)}`);
    },
  };
  const handler = createReportGenerationHandler();
  const result = await handler({
    pool,
    scope,
    logger: { info: () => undefined, error: () => undefined },
  });

  assert.equal(result.generated, 0);
  assert.equal(result.errors, 0);
});
