import test, { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { applyMigrations } from "../db/migrate-lib.js";

const { Pool } = pg;
const integrationEnabled = process.env.OWNER_MIGRATION_INTEGRATION === "1";

if (!integrationEnabled) {
  test("owner migration integration tests are disabled", { skip: "set OWNER_MIGRATION_INTEGRATION=1" }, () => {});
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

  describe("owner_user_id migration and compatibility", { concurrency: 1 }, () => {
    let pool = null;
    let scopeId = null;
    let projectId = null;
    let resolvedUserId = null;
    let accountResolvedId = null;
    let accountUnresolvedId = null;
    let opportunityUnresolvedId = null;

    before(async () => {
      pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
      await setupDb(pool);

      const { rows: scopeRows } = await pool.query(
        "SELECT id::text AS id FROM account_scopes WHERE scope_key = 'default' LIMIT 1"
      );
      scopeId = scopeRows[0]?.id;
      assert.ok(scopeId);

      const { rows: projectRows } = await pool.query(
        "INSERT INTO projects(name, account_scope_id) VALUES ('owner-migration-it', $1) RETURNING id::text AS id",
        [scopeId]
      );
      projectId = projectRows[0]?.id;
      assert.ok(projectId);

      const { rows: userRows } = await pool.query(
        `
          INSERT INTO app_users(username, password_hash, role, email)
          VALUES ('owner_migrated', 'hash', 'pm', 'owner_migrated@example.local')
          RETURNING id::text AS id
        `
      );
      resolvedUserId = userRows[0]?.id;
      assert.ok(resolvedUserId);
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("backfills owner_user_id and logs unresolved usernames without duplicates", async () => {
      await pool.query("ALTER TABLE crm_accounts DISABLE TRIGGER crm_accounts_owner_sync_guard");
      await pool.query("ALTER TABLE crm_accounts DISABLE TRIGGER crm_accounts_owner_log_guard");
      await pool.query("ALTER TABLE crm_opportunities DISABLE TRIGGER crm_opportunities_owner_sync_guard");
      await pool.query("ALTER TABLE crm_opportunities DISABLE TRIGGER crm_opportunities_owner_log_guard");

      const { rows: accountRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES
            ($1, $2, 'Resolved Legacy Account', 'active', 'owner_migrated'),
            ($1, $2, 'Unresolved Legacy Account', 'active', 'ghost_owner')
          RETURNING id::text AS id, name
        `,
        [projectId, scopeId]
      );
      accountResolvedId = accountRows.find((r) => r.name === "Resolved Legacy Account")?.id || null;
      accountUnresolvedId = accountRows.find((r) => r.name === "Unresolved Legacy Account")?.id || null;
      assert.ok(accountResolvedId);
      assert.ok(accountUnresolvedId);

      const { rows: oppRows } = await pool.query(
        `
          INSERT INTO crm_opportunities(
            project_id, account_scope_id, account_id, title, stage, amount_estimate, probability, next_step, owner_username
          )
          VALUES ($1, $2, $3, 'Unresolved Legacy Opportunity', 'qualified', 100, 0.3, 'next', 'ghost_owner')
          RETURNING id::text AS id
        `,
        [projectId, scopeId, accountResolvedId]
      );
      opportunityUnresolvedId = oppRows[0]?.id || null;
      assert.ok(opportunityUnresolvedId);

      await pool.query("ALTER TABLE crm_accounts ENABLE TRIGGER crm_accounts_owner_sync_guard");
      await pool.query("ALTER TABLE crm_accounts ENABLE TRIGGER crm_accounts_owner_log_guard");
      await pool.query("ALTER TABLE crm_opportunities ENABLE TRIGGER crm_opportunities_owner_sync_guard");
      await pool.query("ALTER TABLE crm_opportunities ENABLE TRIGGER crm_opportunities_owner_log_guard");

      await pool.query("SELECT run_owner_backfill()");

      const { rows: resolvedRows } = await pool.query(
        "SELECT owner_user_id::text AS owner_user_id, owner_username FROM crm_accounts WHERE id = $1",
        [accountResolvedId]
      );
      assert.equal(resolvedRows[0]?.owner_user_id, resolvedUserId);
      assert.equal(resolvedRows[0]?.owner_username, "owner_migrated");

      const { rows: unresolvedRows } = await pool.query(
        `
          SELECT owner_user_id::text AS owner_user_id, owner_username
          FROM crm_accounts
          WHERE id = $1
        `,
        [accountUnresolvedId]
      );
      assert.equal(unresolvedRows[0]?.owner_user_id, null);
      assert.equal(unresolvedRows[0]?.owner_username, "ghost_owner");

      const { rows: unresolvedOppRows } = await pool.query(
        `
          SELECT owner_user_id::text AS owner_user_id, owner_username
          FROM crm_opportunities
          WHERE id = $1
        `,
        [opportunityUnresolvedId]
      );
      assert.equal(unresolvedOppRows[0]?.owner_user_id, null);
      assert.equal(unresolvedOppRows[0]?.owner_username, "ghost_owner");

      const { rows: errorsAfterFirstRun } = await pool.query(
        `
          SELECT entity_type, entity_id::text AS entity_id, owner_username
          FROM owner_backfill_errors
          ORDER BY entity_type, entity_id
        `
      );
      assert.equal(errorsAfterFirstRun.length, 2);

      await pool.query("SELECT run_owner_backfill()");
      const { rows: errorsAfterSecondRun } = await pool.query(
        "SELECT count(*)::int AS cnt FROM owner_backfill_errors"
      );
      assert.equal(errorsAfterSecondRun[0]?.cnt, 2);
    });

    it("keeps write compatibility for owner_user_id and owner_username payloads", async () => {
      // owner_user_id write path should mirror username.
      const { rows: directOwnerRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_user_id)
          VALUES ($1, $2, 'Direct Owner User ID', 'active', $3)
          RETURNING owner_user_id::text AS owner_user_id, owner_username
        `,
        [projectId, scopeId, resolvedUserId]
      );
      assert.equal(directOwnerRows[0]?.owner_user_id, resolvedUserId);
      assert.equal(directOwnerRows[0]?.owner_username, "owner_migrated");

      // legacy owner_username write path should still resolve to owner_user_id.
      const { rows: legacyRows } = await pool.query(
        `
          INSERT INTO crm_accounts(project_id, account_scope_id, name, stage, owner_username)
          VALUES ($1, $2, 'Legacy Owner Username', 'active', 'OWNER_MIGRATED')
          RETURNING owner_user_id::text AS owner_user_id, owner_username
        `,
        [projectId, scopeId]
      );
      assert.equal(legacyRows[0]?.owner_user_id, resolvedUserId);
      assert.equal(legacyRows[0]?.owner_username, "owner_migrated");
    });
  });
}
