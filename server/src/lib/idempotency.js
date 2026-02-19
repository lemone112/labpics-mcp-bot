/**
 * Idempotency key support for mutation endpoints.
 * Client sends X-Idempotency-Key header → server caches response for 24h.
 * On retry with same key, returns cached response without re-executing.
 */

const HEADER = "x-idempotency-key";
const TTL_HOURS = 24;

export function getIdempotencyKey(request) {
  const key = String(request.headers?.[HEADER] || "").trim();
  return key.length >= 1 && key.length <= 256 ? key : null;
}

export async function findCachedResponse(pool, projectId, idempotencyKey) {
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
  return rows[0] || null;
}

export async function storeCachedResponse(pool, projectId, idempotencyKey, route, statusCode, responseBody) {
  await pool.query(
    `
      INSERT INTO idempotency_keys (project_id, idempotency_key, route, status_code, response_body, expires_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, now() + interval '${TTL_HOURS} hours')
      ON CONFLICT (project_id, idempotency_key)
      DO NOTHING
    `,
    [projectId, idempotencyKey, route, statusCode, JSON.stringify(responseBody)]
  );
}

export async function cleanExpiredKeys(pool) {
  const { rowCount } = await pool.query(
    `DELETE FROM idempotency_keys WHERE expires_at < now()`
  );
  return rowCount || 0;
}
