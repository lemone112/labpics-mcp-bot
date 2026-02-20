import pg from "pg";
import type { Logger } from "../types/index.js";

const { Pool } = pg;
type Pool = InstanceType<typeof Pool>;
type PoolClient = pg.PoolClient;

export function createDbPool(databaseUrl: string, logger: Logger | Console = console): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: parseInt(process.env.PG_POOL_MAX as string, 10) || 25,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS as string, 10) || 30_000,
    application_name: process.env.PG_APP_NAME || "labpics-dashboard",
  });
  pool.on("error", (err: Error) => {
    logger.error({ err: String(err?.message || err) }, "pg_pool_background_error");
  });
  pool.on("connect", () => {
    const { totalCount, idleCount, waitingCount } = pool;
    if (waitingCount > 5) {
      logger.warn({ totalCount, idleCount, waitingCount }, "pg_pool_saturation_warning");
    }
  });
  return pool;
}

export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export function getPoolStats(pool: Pool): PoolStats {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function vectorLiteral(values: unknown): string {
  const nums = Array.isArray(values) ? values : [];
  return `[${nums.map((v) => Number(v) || 0).join(",")}]`;
}
