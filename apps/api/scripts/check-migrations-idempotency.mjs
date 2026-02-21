import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations } from "../db/migrate-lib.js";

const { Pool } = pg;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function resetPublicSchema(pool) {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
  await pool.query("GRANT ALL ON SCHEMA public TO public");
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    const migrationsDir = path.resolve(currentDir, "../db/migrations");

    await resetPublicSchema(pool);

    const firstRun = await applyMigrations(pool, migrationsDir, console);
    const secondRun = await applyMigrations(pool, migrationsDir, console);

    if (secondRun.length !== 0) {
      throw new Error(
        `Migrations are not idempotent: second run applied ${secondRun.length} files (${secondRun.join(", ")})`
      );
    }

    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM schema_migrations");
    const count = rows?.[0]?.count ?? 0;
    if (count !== firstRun.length) {
      throw new Error(`schema_migrations count mismatch: expected ${firstRun.length}, got ${count}`);
    }

    console.log(
      `Migration idempotency check passed. Applied ${firstRun.length} migration(s) on first run, 0 on second run.`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration idempotency check failed:", error);
  process.exit(1);
});
