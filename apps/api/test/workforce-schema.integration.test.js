import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { seedWorkforceFixtures } from "./fixtures/workforce-fixtures.js";

const { Pool } = pg;
const integrationEnabled = process.env.WORKFORCE_SCHEMA_INTEGRATION === "1";

if (!integrationEnabled) {
  test("workforce schema integration tests are disabled", { skip: "set WORKFORCE_SCHEMA_INTEGRATION=1" }, () => {});
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

  describe("workforce schema invariants", { concurrency: 1 }, () => {
    let pool = null;
    let fixture = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
      await setupDb(pool);
      fixture = await seedWorkforceFixtures(pool);
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("accepts valid employee condition and rejects overlapping period", async () => {
      const { rows: firstRows } = await pool.query(
        `
          INSERT INTO employee_conditions(
            employee_id, project_id, account_scope_id, condition_type, payload, effective_from, effective_to
          )
          VALUES ($1, $2, $3, 'workload', '{"hours": 8}'::jsonb, '2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z')
          RETURNING id::text AS id
        `,
        [fixture.employeeA, fixture.projectA, fixture.scopeA]
      );
      assert.equal(firstRows.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_conditions(
                employee_id, project_id, account_scope_id, condition_type, payload, effective_from, effective_to
              )
              VALUES ($1, $2, $3, 'workload', '{"hours": 6}'::jsonb, '2026-01-05T00:00:00Z', '2026-01-15T00:00:00Z')
            `,
            [fixture.employeeA, fixture.projectA, fixture.scopeA]
          )
      );

      const { rows: secondRows } = await pool.query(
        `
          INSERT INTO employee_conditions(
            employee_id, project_id, account_scope_id, condition_type, payload, effective_from, effective_to
          )
          VALUES ($1, $2, $3, 'workload', '{"hours": 6}'::jsonb, '2026-01-10T00:00:00Z', '2026-01-20T00:00:00Z')
          RETURNING id::text AS id
        `,
        [fixture.employeeA, fixture.projectA, fixture.scopeA]
      );
      assert.equal(secondRows.length, 1);
    });

    it("rejects cross-scope condition rows by project and employee scope guards", async () => {
      // projectA belongs to scopeA but row says scopeB -> must fail.
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_conditions(
                employee_id, project_id, account_scope_id, condition_type, payload, effective_from
              )
              VALUES ($1, $2, $3, 'rate', '{"usd_per_hour":120}'::jsonb, '2026-02-01T00:00:00Z')
            `,
            [fixture.employeeA, fixture.projectA, fixture.scopeB]
          )
      );

      // project is NULL, only employee scope guard remains -> also must fail.
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_conditions(
                employee_id, project_id, account_scope_id, condition_type, payload, effective_from
              )
              VALUES ($1, NULL, $2, 'sla', '{"target":"p1"}'::jsonb, '2026-02-01T00:00:00Z')
            `,
            [fixture.employeeA, fixture.scopeB]
          )
      );
    });

    it("enforces unique and scope-safe employee capacity rows", async () => {
      const { rows: inserted } = await pool.query(
        `
          INSERT INTO employee_capacity_calendar(
            employee_id, project_id, account_scope_id, day, capacity_hours
          )
          VALUES ($1, $2, $3, '2026-02-15', 6.50)
          RETURNING id
        `,
        [fixture.employeeA, fixture.projectA, fixture.scopeA]
      );
      assert.equal(inserted.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_capacity_calendar(
                employee_id, project_id, account_scope_id, day, capacity_hours
              )
              VALUES ($1, $2, $3, '2026-02-15', 7.00)
            `,
            [fixture.employeeA, fixture.projectA, fixture.scopeA]
          )
      );

      const { rows: nullProjectFirst } = await pool.query(
        `
          INSERT INTO employee_capacity_calendar(
            employee_id, project_id, account_scope_id, day, capacity_hours
          )
          VALUES ($1, NULL, $2, '2026-02-16', 8.00)
          RETURNING id
        `,
        [fixture.employeeA, fixture.scopeA]
      );
      assert.equal(nullProjectFirst.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_capacity_calendar(
                employee_id, project_id, account_scope_id, day, capacity_hours
              )
              VALUES ($1, NULL, $2, '2026-02-16', 4.00)
            `,
            [fixture.employeeA, fixture.scopeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_capacity_calendar(
                employee_id, project_id, account_scope_id, day, capacity_hours
              )
              VALUES ($1, $2, $3, '2026-02-17', 5.00)
            `,
            [fixture.employeeA, fixture.projectA, fixture.scopeB]
          )
      );
    });

    it("enforces skills uniqueness, level checks and employee scope consistency", async () => {
      const { rows } = await pool.query(
        `
          INSERT INTO employee_skills(employee_id, account_scope_id, skill_key, skill_level)
          VALUES ($1, $2, 'postgresql', 4)
          RETURNING id
        `,
        [fixture.employeeA, fixture.scopeA]
      );
      assert.equal(rows.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_skills(employee_id, account_scope_id, skill_key, skill_level)
              VALUES ($1, $2, 'postgresql', 5)
            `,
            [fixture.employeeA, fixture.scopeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_skills(employee_id, account_scope_id, skill_key, skill_level)
              VALUES ($1, $2, 'redis', 0)
            `,
            [fixture.employeeA, fixture.scopeA]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO employee_skills(employee_id, account_scope_id, skill_key, skill_level)
              VALUES ($1, $2, 'integration', 3)
            `,
            [fixture.employeeA, fixture.scopeB]
          )
      );
    });
  });
}
