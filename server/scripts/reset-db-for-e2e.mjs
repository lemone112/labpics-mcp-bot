import "dotenv/config";
import pg from "pg";

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
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
    console.log("E2E schema reset complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("E2E schema reset failed:", error);
  process.exit(1);
});
