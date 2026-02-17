import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations } from "./migrate-lib.js";

const { Pool } = pg;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    const migrationsDir = path.join(currentDir, "migrations");
    const executed = await applyMigrations(pool, migrationsDir, console);
    console.log(`Migrations complete. Applied: ${executed.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
