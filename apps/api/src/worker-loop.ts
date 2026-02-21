import "dotenv/config";

import { createDbPool } from "./infra/db.js";
import { createLogger } from "./infra/logger.js";
import { createRedisPubSub } from "./infra/redis-pubsub.js";
import { requiredEnv } from "./infra/utils.js";
import { runSchedulerTick } from "./domains/core/scheduler.js";

const logger = createLogger("worker-loop");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(
  pool: ReturnType<typeof createDbPool>,
  limitPerProject: number,
  publishFn: ((channel: string, message: unknown) => Promise<void> | void) | null
) {
  const { rows } = await pool.query(
    `
      SELECT id AS project_id, account_scope_id
      FROM projects
      ORDER BY created_at DESC
    `
  );

  let processed = 0;
  let failed = 0;
  let projectErrors = 0;
  for (const row of rows as Array<{ project_id: string; account_scope_id: string }>) {
    const scope = {
      projectId: row.project_id,
      accountScopeId: row.account_scope_id,
    };
    try {
      const result = await runSchedulerTick(pool, scope, { limit: limitPerProject, logger, publishFn } as any);
      processed += (result as any).processed;
      failed += (result as any).failed;
    } catch (error) {
      projectErrors += 1;
      logger.error(
        {
          project_id: scope.projectId,
          account_scope_id: scope.accountScopeId,
          err: String((error as Error)?.message || error),
        },
        "project scheduler tick failed"
      );
    }
  }

  logger.info({ projects: rows.length, processed, failed, project_errors: projectErrors }, "worker cycle complete");
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const limitPerProject = Number.parseInt(String(process.env.WORKER_TICK_LIMIT || "25"), 10) || 25;
  const intervalSeconds = Number.parseInt(String(process.env.WORKER_INTERVAL_SECONDS || "60"), 10) || 60;
  const pool = createDbPool(databaseUrl);

  const redisPubSub = createRedisPubSub({ logger });
  const publishFn = redisPubSub.enabled
    ? async (channel: string, message: unknown) => {
        await redisPubSub.publish(channel, message as any);
      }
    : null;

  if (redisPubSub.enabled) {
    logger.info("redis pub/sub enabled for job completion events");
  } else {
    logger.warn("redis unavailable, real-time SSE disabled (polling still active)");
  }

  let running = true;
  async function gracefulShutdown(signal: string) {
    logger.info({ signal }, "shutdown signal received");
    running = false;
    const deadlineMs = parseInt(String(process.env.SHUTDOWN_TIMEOUT_MS), 10) || 30_000;
    const forceExit = setTimeout(() => {
      logger.fatal({ deadline_ms: deadlineMs }, "force exit — shutdown deadline exceeded");
      process.exit(1);
    }, deadlineMs);
    forceExit.unref();
  }
  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });

  try {
    while (running) {
      try {
        await runCycle(pool, limitPerProject, publishFn);
      } catch (error) {
        logger.error({ err: error }, "worker cycle failed");
      }
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
