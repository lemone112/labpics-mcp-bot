import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILTIN_TEMPLATES,
  VALID_FORMATS,
  VALID_SECTIONS,
  ensureBuiltinTemplates,
  getReportTemplate,
  listReportTemplates,
  upsertReportTemplate,
  validateFormat,
  validateSchedule,
  validateSections,
} from "../src/domains/analytics/report-templates.js";

const scope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  accountScopeId: "22222222-2222-4222-8222-222222222222",
};

function makeTemplateRow(overrides = {}) {
  return {
    id: "tpl-1",
    name: "Weekly Summary",
    description: "desc",
    sections: ["summary_stats"],
    format: "json",
    schedule: "0 9 * * 1",
    active: true,
    created_at: "2026-02-21T00:00:00.000Z",
    updated_at: "2026-02-21T00:00:00.000Z",
    ...overrides,
  };
}

test("validateSections handles valid input and rejects invalid variants", () => {
  assert.deepStrictEqual(validateSections(["summary_stats", "connector_health"]), {
    valid: true,
  });
  assert.deepStrictEqual(validateSections([]), {
    valid: false,
    error: "sections must be a non-empty array",
  });
  assert.equal(validateSections("not-array").valid, false);
  const invalid = validateSections(["summary_stats", "bad_section"]);
  assert.equal(invalid.valid, false);
  assert.match(String(invalid.error), /invalid section: "bad_section"/);
});

test("validateFormat validates allowed values only", () => {
  assert.deepStrictEqual(validateFormat("json"), { valid: true });
  assert.deepStrictEqual(validateFormat("html"), { valid: true });
  assert.equal(validateFormat("").valid, false);
  assert.equal(validateFormat("markdown").valid, false);
});

test("validateSchedule accepts null/empty and validates 5-field shape", () => {
  assert.deepStrictEqual(validateSchedule(null), { valid: true });
  assert.deepStrictEqual(validateSchedule(""), { valid: true });
  assert.deepStrictEqual(validateSchedule("0 9 * * 1"), { valid: true });
  assert.deepStrictEqual(validateSchedule("0 9 * *"), {
    valid: false,
    error: "schedule must be a valid 5-field cron expression",
  });
});

test("listReportTemplates queries scoped templates and returns rows", async () => {
  const expected = [makeTemplateRow({ id: "tpl-a" }), makeTemplateRow({ id: "tpl-b" })];
  let captured = null;
  const pool = {
    query: async (sql, params) => {
      captured = { sql: String(sql), params };
      return { rows: expected };
    },
  };

  const rows = await listReportTemplates(pool, scope);
  assert.deepStrictEqual(rows, expected);
  assert.deepStrictEqual(captured.params, [scope.projectId, scope.accountScopeId]);
  assert.match(captured.sql, /FROM report_templates/);
  assert.match(captured.sql, /ORDER BY name ASC/);
});

test("getReportTemplate returns a row or null", async () => {
  const row = makeTemplateRow({ id: "tpl-x" });
  let calls = 0;
  const pool = {
    query: async () => {
      calls += 1;
      if (calls === 1) return { rows: [row] };
      return { rows: [] };
    },
  };

  const found = await getReportTemplate(pool, scope, "tpl-x");
  assert.deepStrictEqual(found, row);
  const missing = await getReportTemplate(pool, scope, "tpl-missing");
  assert.equal(missing, null);
});

test("upsertReportTemplate validates name, sections, format, and schedule", async () => {
  const pool = { query: async () => ({ rows: [] }) };

  await assert.rejects(
    () => upsertReportTemplate(pool, scope, { name: "", sections: ["summary_stats"] }),
    /Template name is required/
  );
  await assert.rejects(
    () => upsertReportTemplate(pool, scope, { name: "X", sections: ["bad"] }),
    /invalid section/
  );
  await assert.rejects(
    () => upsertReportTemplate(pool, scope, {
      name: "X",
      sections: ["summary_stats"],
      format: "xml",
    }),
    /invalid format/
  );
  await assert.rejects(
    () => upsertReportTemplate(pool, scope, {
      name: "X",
      sections: ["summary_stats"],
      schedule: "0 9 * *",
    }),
    /schedule must be a valid 5-field cron expression/
  );
});

test("upsertReportTemplate inserts template with defaults", async () => {
  const inserted = makeTemplateRow({ id: "tpl-new", name: "New Name", schedule: null });
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [inserted] };
    },
  };

  const result = await upsertReportTemplate(pool, scope, {
    name: "  New Name  ",
    description: "  Some desc  ",
    sections: ["summary_stats", "error_summary"],
    schedule: "   ",
  });

  assert.deepStrictEqual(result, inserted);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO report_templates/);
  assert.deepStrictEqual(calls[0].params, [
    scope.projectId,
    scope.accountScopeId,
    "New Name",
    "Some desc",
    JSON.stringify(["summary_stats", "error_summary"]),
    "json",
    null,
    true,
  ]);
});

test("upsertReportTemplate updates template when id provided and handles not found", async () => {
  const updated = makeTemplateRow({
    id: "tpl-upd",
    name: "Updated",
    format: "html",
    schedule: "0 8 * * *",
    active: false,
  });
  let calls = 0;
  const pool = {
    query: async (sql, params) => {
      calls += 1;
      assert.match(String(sql), /UPDATE report_templates/);
      if (calls === 1) {
        assert.deepStrictEqual(params, [
          "tpl-upd",
          scope.projectId,
          scope.accountScopeId,
          "Updated",
          null,
          JSON.stringify(["summary_stats"]),
          "html",
          "0 8 * * *",
          false,
        ]);
        return { rows: [updated] };
      }
      return { rows: [] };
    },
  };

  const ok = await upsertReportTemplate(pool, scope, {
    id: "tpl-upd",
    name: "Updated",
    sections: ["summary_stats"],
    format: "html",
    schedule: "0 8 * * *",
    active: false,
  });
  assert.deepStrictEqual(ok, updated);

  await assert.rejects(
    () =>
      upsertReportTemplate(pool, scope, {
        id: "tpl-missing",
        name: "Missing",
        sections: ["summary_stats"],
      }),
    /Template not found/
  );
});

test("ensureBuiltinTemplates skips seeding when templates already exist", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [{ cnt: 2 }] };
    },
  };

  const seeded = await ensureBuiltinTemplates(pool, scope);
  assert.equal(seeded, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /SELECT count\(\*\)::int AS cnt/);
});

test("ensureBuiltinTemplates seeds all builtins when scope has none", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (calls.length === 1) return { rows: [{ cnt: 0 }] };
      return { rows: [] };
    },
  };

  const seeded = await ensureBuiltinTemplates(pool, scope);
  assert.equal(seeded, BUILTIN_TEMPLATES.length);
  assert.equal(calls.length, 1 + BUILTIN_TEMPLATES.length);
  for (let i = 1; i < calls.length; i += 1) {
    assert.match(calls[i].sql, /INSERT INTO report_templates/);
  }

  const firstInsertParams = calls[1].params;
  assert.deepStrictEqual(firstInsertParams.slice(0, 2), [scope.projectId, scope.accountScopeId]);
  assert.equal(firstInsertParams[2], BUILTIN_TEMPLATES[0].name);
  assert.equal(firstInsertParams[3], BUILTIN_TEMPLATES[0].description);
  assert.equal(firstInsertParams[4], JSON.stringify(BUILTIN_TEMPLATES[0].sections));
  assert.equal(firstInsertParams[5], BUILTIN_TEMPLATES[0].format);
  assert.equal(firstInsertParams[6], BUILTIN_TEMPLATES[0].schedule);
});

test("exports expose expected allowed section/format sets", () => {
  assert.equal(VALID_SECTIONS.has("summary_stats"), true);
  assert.equal(VALID_SECTIONS.has("not_allowed"), false);
  assert.equal(VALID_FORMATS.has("json"), true);
  assert.equal(VALID_FORMATS.has("xml"), false);
});
