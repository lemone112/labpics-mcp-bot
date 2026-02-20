import type { Pool } from "../types/index.js";

const HEADER = "x-idempotency-key";
const TTL_HOURS = 24;

interface RequestHeaders {
  headers?: Record<string, string | string[] | undefined>;
}

export function getIdempotencyKey(request: RequestHeaders): string | null {
  const key = String(request.headers?.[HEADER] || "").trim();
  return key.length >= 1 && key.length <= 256 ? key : null;
}

interface CachedResponse {
  status_code: number;
  response_body: unknown;
}

export async function findCachedResponse(pool: Pool, projectId: string, idempotencyKey: string): Promise<CachedResponse | null> {
  const { rows } = await pool.query(
    `
      SELECT status_code, response_body
      FROM idempotency_keys
      WHERE project_id = $1
        AND idempotency_key = $2
        AND expires_at > now()
      LIMIT 1
    `,
    [projectId, idempotencyKey]
  );
  return (rows[0] as CachedResponse) || null;
}

export async function storeCachedResponse(
  pool: Pool,
  projectId: string,
  idempotencyKey: string,
  route: string,
  statusCode: number,
  responseBody: unknown,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO idempotency_keys (project_id, idempotency_key, route, status_code, response_body, expires_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, now() + make_interval(hours => $6))
      ON CONFLICT (project_id, idempotency_key)
      DO NOTHING
    `,
    [projectId, idempotencyKey, route, statusCode, JSON.stringify(responseBody), TTL_HOURS]
  );
}

export async function cleanExpiredKeys(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM idempotency_keys WHERE expires_at < now()`
  );
  return rowCount || 0;
}
