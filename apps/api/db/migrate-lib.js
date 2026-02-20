import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function applyMigrations(pool, migrationsDir, logger = console) {
  await ensureMigrationsTable(pool);

  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((ent) => ent.isFile() && ent.name.endsWith(".sql"))
    .map((ent) => ent.name)
    .sort((a, b) => a.localeCompare(b));

  const applied = await pool.query("SELECT filename FROM schema_migrations");
  const alreadyApplied = new Set(applied.rows.map((row) => row.filename));
  const executed = [];

  for (const filename of files) {
    if (alreadyApplied.has(filename)) continue;
    const fullPath = path.join(migrationsDir, filename);
    const sql = await readFile(fullPath, "utf8");

    // Detect CONCURRENTLY in actual SQL (not comments)
    const sqlNoComments = sql.replace(/--.*$/gm, "");
    const needsNoTx = /\bCONCURRENTLY\b/i.test(sqlNoComments);

    const client = await pool.connect();
    try {
      if (needsNoTx) {
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
        // Multi-statement queries use implicit transactions, so split and run each statement separately.
        const statements = sqlNoComments
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [filename]);
      } else {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
      }
      executed.push(filename);
      logger.info({ filename }, "migration applied");
    } catch (error) {
      if (!needsNoTx) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return executed;
}
