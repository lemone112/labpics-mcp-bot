import "dotenv/config";

import { createDbPool } from "./lib/db.js";
import { runSchedulerTick } from "./services/scheduler.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(pool, limitPerProject) {
  const { rows } = await pool.query(
    `
      SELECT id AS project_id, account_scope_id
      FROM projects
      ORDER BY created_at DESC
    `
  );

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const scope = {
      projectId: row.project_id,
      accountScopeId: row.account_scope_id,
    };
    const result = await runSchedulerTick(pool, scope, { limit: limitPerProject, logger: console });
    processed += result.processed;
    failed += result.failed;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        type: "worker_cycle",
        projects: rows.length,
        processed,
        failed,
        at: new Date().toISOString(),
      }
    )
  );
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const limitPerProject = Number.parseInt(String(process.env.WORKER_TICK_LIMIT || "25"), 10) || 25;
  const intervalSeconds = Number.parseInt(String(process.env.WORKER_INTERVAL_SECONDS || "60"), 10) || 60;
  const pool = createDbPool(databaseUrl);

  try {
    while (true) {
      try {
        await runCycle(pool, limitPerProject);
      } catch (error) {
        console.error("worker cycle failed:", error);
      }
      await sleep(intervalSeconds * 1000);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
