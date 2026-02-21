import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";

const { Pool } = pg;
const integrationEnabled = process.env.SCOPE_HARDENING_INTEGRATION === "1";

if (!integrationEnabled) {
  test("scope hardening integration tests are disabled", { skip: "set SCOPE_HARDENING_INTEGRATION=1" }, () => {});
} else {
  function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
  }

  async function resetSchema(pool) {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  }

  async function setupDb(pool) {
    const currentFile = fileURLToPath(import.meta.url);
    const migrationsDir = path.resolve(path.dirname(currentFile), "../db/migrations");
    await resetSchema(pool);
    await applyMigrations(pool, migrationsDir, console);
  }

  describe("scope hardening migrations (reports/search_analytics)", { concurrency: 1 }, () => {
    let pool = null;
    let scopeA = null;
    let scopeB = null;
    let projectA = null;
    let projectB = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
      await setupDb(pool);

      const { rows: scopeRows } = await pool.query(
        "SELECT id::text AS id FROM account_scopes WHERE scope_key = 'default' LIMIT 1"
      );
      scopeA = scopeRows[0]?.id;
      assert.ok(scopeA, "default scope must exist");

      const { rows: newScopeRows } = await pool.query(
        "INSERT INTO account_scopes(scope_key, name) VALUES ('it-scope-b', 'Integration Scope B') RETURNING id::text AS id"
      );
      scopeB = newScopeRows[0]?.id;

      const { rows: p1 } = await pool.query(
        "INSERT INTO projects(name, account_scope_id) VALUES ('it-project-a', $1) RETURNING id::text AS id",
        [scopeA]
      );
      projectA = p1[0]?.id;

      const { rows: p2 } = await pool.query(
        "INSERT INTO projects(name, account_scope_id) VALUES ('it-project-b', $1) RETURNING id::text AS id",
        [scopeA]
      );
      projectB = p2[0]?.id;
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("accepts report_templates rows with matching project/account scope", async () => {
      const { rows } = await pool.query(
        `
          INSERT INTO report_templates(project_id, account_scope_id, name, sections, format, active)
          VALUES ($1, $2, 'Template A', '["summary_stats"]'::jsonb, 'json', true)
          RETURNING id::text AS id
        `,
        [projectA, scopeA]
      );
      assert.equal(rows.length, 1);
    });

    it("rejects report_templates rows with cross-scope mismatch", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO report_templates(project_id, account_scope_id, name, sections, format, active)
              VALUES ($1, $2, 'Bad Template', '["summary_stats"]'::jsonb, 'json', true)
            `,
            [projectA, scopeB]
          )
      );
    });

    it("enforces generated_reports template/project consistency", async () => {
      const { rows: templateRows } = await pool.query(
        `
          INSERT INTO report_templates(project_id, account_scope_id, name, sections, format, active)
          VALUES ($1, $2, 'Template For Generated', '["summary_stats"]'::jsonb, 'json', true)
          RETURNING id::uuid AS id
        `,
        [projectA, scopeA]
      );
      const templateId = templateRows[0]?.id;
      assert.ok(templateId);

      // Valid row.
      const { rows: generatedRows } = await pool.query(
        `
          INSERT INTO generated_reports(
            template_id, project_id, account_scope_id, template_name,
            date_range_start, date_range_end, data, format, status
          )
          VALUES ($1, $2, $3, 'Template For Generated', '2026-01-01', '2026-01-07', '{}'::jsonb, 'json', 'completed')
          RETURNING id::text AS id
        `,
        [templateId, projectA, scopeA]
      );
      assert.equal(generatedRows.length, 1);

      // Same scope, different project must be rejected by template scope trigger.
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO generated_reports(
                template_id, project_id, account_scope_id, template_name,
                date_range_start, date_range_end, data, format, status
              )
              VALUES ($1, $2, $3, 'Template For Generated', '2026-01-01', '2026-01-07', '{}'::jsonb, 'json', 'completed')
            `,
            [templateId, projectB, scopeA]
          )
      );
    });

    it("rejects search_analytics rows with null project_id", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO search_analytics(query, result_count, filters, project_id, account_scope_id, event_type)
              VALUES ('q', 1, '{}'::jsonb, NULL, $1, 'search')
            `,
            [scopeA]
          )
      );
    });

    it("rejects search_analytics rows with cross-scope mismatch", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO search_analytics(query, result_count, filters, project_id, account_scope_id, event_type)
              VALUES ('q', 1, '{}'::jsonb, $1, $2, 'search')
            `,
            [projectA, scopeB]
          )
      );
    });

    it("accepts search_analytics rows with matching project/account scope", async () => {
      const { rows } = await pool.query(
        `
          INSERT INTO search_analytics(
            query, result_count, filters, project_id, account_scope_id, event_type, duration_ms
          )
          VALUES ('deal handoff', 3, '{"source":"messages"}'::jsonb, $1, $2, 'search', 120)
          RETURNING id::text AS id
        `,
        [projectA, scopeA]
      );
      assert.equal(rows.length, 1);
    });
  });
}
