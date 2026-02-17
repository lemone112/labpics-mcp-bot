import "dotenv/config";

import { createDbPool } from "./lib/db.js";
import { runSchedulerTick } from "./services/scheduler.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const limitPerProject = Number.parseInt(String(process.env.WORKER_TICK_LIMIT || "25"), 10) || 25;
  const pool = createDbPool(databaseUrl);

  try {
    const { rows } = await pool.query(
      `
        SELECT id AS project_id, account_scope_id
        FROM projects
        ORDER BY created_at DESC
      `
    );
    let totalProcessed = 0;
    let totalFailed = 0;
    for (const row of rows) {
      const scope = {
        projectId: row.project_id,
        accountScopeId: row.account_scope_id,
      };
      const result = await runSchedulerTick(pool, scope, { limit: limitPerProject, logger: console });
      totalProcessed += result.processed;
      totalFailed += result.failed;
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          projects: rows.length,
          processed: totalProcessed,
          failed: totalFailed,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
