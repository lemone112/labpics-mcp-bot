import pg from "pg";

const { Pool } = pg;

export function createDbPool(databaseUrl, logger = console) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: parseInt(process.env.PG_POOL_MAX, 10) || 25,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS, 10) || 30_000,
    application_name: process.env.PG_APP_NAME || "labpics-dashboard",
  });
  pool.on("error", (err) => {
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

export function getPoolStats(pool) {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export async function withTransaction(pool, fn) {
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

export function vectorLiteral(values) {
  const nums = Array.isArray(values) ? values : [];
  return `[${nums.map((v) => Number(v) || 0).join(",")}]`;
}
