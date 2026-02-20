import "dotenv/config";

import { createDbPool } from "./lib/db.js";
import { createLogger } from "./lib/logger.js";
import { createRedisPubSub } from "./lib/redis-pubsub.js";
import { requiredEnv } from "./lib/utils.js";
import { runSchedulerTick } from "./services/scheduler.js";

const logger = createLogger("worker-loop");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(pool, limitPerProject, publishFn) {
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
    const result = await runSchedulerTick(pool, scope, { limit: limitPerProject, logger, publishFn });
    processed += result.processed;
    failed += result.failed;
  }

  logger.info({ projects: rows.length, processed, failed }, "worker cycle complete");
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const limitPerProject = Number.parseInt(String(process.env.WORKER_TICK_LIMIT || "25"), 10) || 25;
  const intervalSeconds = Number.parseInt(String(process.env.WORKER_INTERVAL_SECONDS || "60"), 10) || 60;
  const pool = createDbPool(databaseUrl);

  // Redis for publishing job completion events
  const redisPubSub = createRedisPubSub({ logger });
  const publishFn = redisPubSub.enabled
    ? (channel, message) => redisPubSub.publish(channel, message)
    : null;

  if (redisPubSub.enabled) {
    logger.info("redis pub/sub enabled for job completion events");
  } else {
    logger.warn("redis unavailable, real-time SSE disabled (polling still active)");
  }

  // --- Graceful shutdown ---
  let running = true;
  async function gracefulShutdown(signal) {
    logger.info({ signal }, "shutdown signal received");
    running = false;
    const deadlineMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30_000;
    const forceExit = setTimeout(() => {
      logger.fatal({ deadline_ms: deadlineMs }, "force exit — shutdown deadline exceeded");
      process.exit(1);
    }, deadlineMs);
    forceExit.unref();
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  try {
    while (running) {
      try {
        await runCycle(pool, limitPerProject, publishFn);
      } catch (error) {
        logger.error({ err: error }, "worker cycle failed");
      }
      // Interruptible sleep: check running flag every second
      for (let i = 0; i < intervalSeconds && running; i++) {
        await sleep(1000);
      }
    }
    logger.info("worker stopped gracefully");
  } finally {
    await redisPubSub.close();
    await pool.end();
  }
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker-loop crashed");
  process.exit(1);
});
