import pg from "pg";

const { Pool } = pg;

export function createDbPool(databaseUrl) {
  return new Pool({
    connectionString: databaseUrl,
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
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
