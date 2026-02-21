import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";
import { seedWorkforceFixtures } from "./fixtures/workforce-fixtures.js";

const { Pool } = pg;
const integrationEnabled = process.env.CLIENT_EXECUTOR_GRAPH_INTEGRATION === "1";

if (!integrationEnabled) {
  test(
    "client-executor graph integration tests are disabled",
    { skip: "set CLIENT_EXECUTOR_GRAPH_INTEGRATION=1" },
    () => {}
  );
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

  describe("client-executor graph invariants", { concurrency: 1 }, () => {
    let pool = null;
    let fixture = null;
    let accountA = null;
    let accountB = null;
    let opportunityA = null;
    let employeeA2 = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
      await setupDb(pool);
      fixture = await seedWorkforceFixtures(pool);

      const { rows: accountRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES
            ($1, $2, 'Acme A', 'active', 'workforce_user_a'),
            ($3, $4, 'Acme B', 'active', 'workforce_user_b')
          RETURNING id::text AS id, project_id::text AS project_id
        `,
        [fixture.projectA, fixture.scopeA, fixture.projectB, fixture.scopeB]
      );
      accountA = accountRows.find((r) => r.project_id === fixture.projectA)?.id || null;
      accountB = accountRows.find((r) => r.project_id === fixture.projectB)?.id || null;
      assert.ok(accountA);
      assert.ok(accountB);

      const { rows: oppRows } = await pool.query(
        `
          INSERT INTO crm_opportunities(
            project_id, account_scope_id, account_id, title, stage, amount_estimate, probability, next_step, owner_username
          )
          VALUES ($1, $2, $3, 'Opp A', 'qualified', 1000, 0.40, 'call', 'workforce_user_a')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA]
      );
      opportunityA = oppRows[0]?.id || null;
      assert.ok(opportunityA);

      const { rows: userRows } = await pool.query(
        `
          INSERT INTO app_users(username, password_hash, role, email)
          VALUES ('workforce_user_a2', 'hash', 'pm', 'workforce_user_a2@example.local')
          RETURNING id::text AS id
        `
      );
      const userA2 = userRows[0]?.id;
      assert.ok(userA2);

      const { rows: employeeRows } = await pool.query(
        `
          INSERT INTO employees(account_scope_id, user_id, display_name, status, timezone)
          VALUES ($1, $2, 'Employee A2', 'active', 'UTC')
          RETURNING id::text AS id
        `,
        [fixture.scopeA, userA2]
      );
      employeeA2 = employeeRows[0]?.id || null;
      assert.ok(employeeA2);
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("enforces active allocation <= 100 for same client", async () => {
      const { rows: firstLinkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_account', $3, $4, 'owner', 60.00, 1, 'active')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA, fixture.employeeA]
      );
      assert.equal(firstLinkRows.length, 1);

      const { rows: secondLinkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_account', $3, $4, 'delivery_lead', 40.00, 2, 'active')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA, employeeA2]
      );
      assert.equal(secondLinkRows.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'observer', 1.00, 3, 'active')
            `,
            [fixture.projectA, fixture.scopeA, accountA, fixture.employeeA]
          )
      );
    });

    it("rejects links when client is missing or scope does not match", async () => {
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'owner', 100, 1, 'active')
            `,
            [fixture.projectA, fixture.scopeA, randomUUID(), fixture.employeeA]
          )
      );

      // accountA belongs to scopeA/projectA, row is intentionally scopeB/projectB.
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'owner', 100, 1, 'active')
            `,
            [fixture.projectB, fixture.scopeB, accountA, fixture.employeeB]
          )
      );

      // employeeB belongs to scopeB, client is in scopeA.
      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_links(
                project_id, account_scope_id, client_type, client_id,
                employee_id, link_type, allocation_pct, priority, status
              )
              VALUES ($1, $2, 'crm_account', $3, $4, 'backup', 25, 2, 'planned')
            `,
            [fixture.projectA, fixture.scopeA, accountA, fixture.employeeB]
          )
      );
    });

    it("rejects self dependencies and cycles in dependency graph", async () => {
      const { rows: linkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES
            ($1, $2, 'crm_opportunity', $3, $4, 'owner', 0, 1, 'planned'),
            ($1, $2, 'crm_opportunity', $3, $5, 'reviewer', 0, 2, 'planned'),
            ($1, $2, 'crm_opportunity', $3, $6, 'observer', 0, 3, 'planned')
          RETURNING id::text AS id, link_type
        `,
        [fixture.projectA, fixture.scopeA, opportunityA, fixture.employeeA, employeeA2, fixture.employeeA]
      );
      const ownerLink = linkRows.find((r) => r.link_type === "owner")?.id;
      const reviewerLink = linkRows.find((r) => r.link_type === "reviewer")?.id;
      const observerLink = linkRows.find((r) => r.link_type === "observer")?.id;
      assert.ok(ownerLink);
      assert.ok(reviewerLink);
      assert.ok(observerLink);

      await pool.query(
        `
          INSERT INTO client_executor_dependencies(
            project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
          )
          VALUES ($1, $2, $3, $4, 'requires')
        `,
        [fixture.projectA, fixture.scopeA, ownerLink, reviewerLink]
      );

      await pool.query(
        `
          INSERT INTO client_executor_dependencies(
            project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
          )
          VALUES ($1, $2, $3, $4, 'requires')
        `,
        [fixture.projectA, fixture.scopeA, reviewerLink, observerLink]
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_dependencies(
                project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
              )
              VALUES ($1, $2, $3, $3, 'requires')
            `,
            [fixture.projectA, fixture.scopeA, ownerLink]
          )
      );

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_dependencies(
                project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
              )
              VALUES ($1, $2, $3, $4, 'requires')
            `,
            [fixture.projectA, fixture.scopeA, observerLink, ownerLink]
          )
      );
    });

    it("rejects dependencies for links that target different clients", async () => {
      const { rows: accountLinkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_account', $3, $4, 'observer', 0, 3, 'planned')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, accountA, employeeA2]
      );
      const accountLink = accountLinkRows[0]?.id;
      assert.ok(accountLink);

      const { rows: oppLinkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_opportunity', $3, $4, 'delivery_lead', 0, 1, 'planned')
          RETURNING id::text AS id
        `,
        [fixture.projectA, fixture.scopeA, opportunityA, fixture.employeeA]
      );
      const oppLink = oppLinkRows[0]?.id;
      assert.ok(oppLink);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_dependencies(
                project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
              )
              VALUES ($1, $2, $3, $4, 'review')
            `,
            [fixture.projectA, fixture.scopeA, oppLink, accountLink]
          )
      );
    });

    it("enforces event scope integrity against referenced link/dependency", async () => {
      const { rows: linkRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_account', $3, $4, 'backup', 10, 3, 'planned')
          RETURNING id::text AS id
        `,
        [fixture.projectB, fixture.scopeB, accountB, fixture.employeeB]
      );
      const linkId = linkRows[0]?.id;
      assert.ok(linkId);

      const { rows: childRows } = await pool.query(
        `
          INSERT INTO client_executor_links(
            project_id, account_scope_id, client_type, client_id,
            employee_id, link_type, allocation_pct, priority, status
          )
          VALUES ($1, $2, 'crm_account', $3, $4, 'observer', 0, 4, 'planned')
          RETURNING id::text AS id
        `,
        [fixture.projectB, fixture.scopeB, accountB, fixture.employeeB]
      );
      const childId = childRows[0]?.id;
      assert.ok(childId);

      const { rows: depRows } = await pool.query(
        `
          INSERT INTO client_executor_dependencies(
            project_id, account_scope_id, parent_link_id, child_link_id, dependency_kind
          )
          VALUES ($1, $2, $3, $4, 'requires')
          RETURNING id::text AS id
        `,
        [fixture.projectB, fixture.scopeB, linkId, childId]
      );
      const dependencyId = depRows[0]?.id;
      assert.ok(dependencyId);

      const { rows: eventRows } = await pool.query(
        `
          INSERT INTO client_executor_events(
            project_id, account_scope_id, link_id, dependency_id, event_type, payload
          )
          VALUES ($1, $2, $3, $4, 'dependency_created', '{"via":"test"}'::jsonb)
          RETURNING id
        `,
        [fixture.projectB, fixture.scopeB, linkId, dependencyId]
      );
      assert.equal(eventRows.length, 1);

      await assert.rejects(
        () =>
          pool.query(
            `
              INSERT INTO client_executor_events(
                project_id, account_scope_id, link_id, event_type, payload
              )
              VALUES ($1, $2, $3, 'link_updated', '{"bad":true}'::jsonb)
            `,
            [fixture.projectA, fixture.scopeA, linkId]
          )
      );
    });
  });
}
