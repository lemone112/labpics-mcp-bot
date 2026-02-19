/**
 * Simple in-memory sliding window rate limiter.
 * No external dependencies — suitable for single-instance deployment.
 */

const windows = new Map();

/**
 * @param {string} key - Unique identifier (e.g. "ip:127.0.0.1" or "user:admin")
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = windows.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { windowStart: now, count: 0 };
    windows.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Create a Fastify preHandler hook for rate limiting.
 * @param {{ maxRequests?: number, windowMs?: number, keyFn?: (request: any) => string }} options
 */
export function rateLimitHook(options = {}) {
  const {
    maxRequests = 30,
    windowMs = 60_000,
    keyFn = (request) => `${request.ip}:${request.url}`,
  } = options;

  return async (request, reply) => {
    const key = keyFn(request);
    const result = checkRateLimit(key, maxRequests, windowMs);

    reply.header("X-RateLimit-Limit", maxRequests);
    reply.header("X-RateLimit-Remaining", Math.max(0, result.remaining));

    if (!result.allowed) {
      reply.header("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      reply.code(429).send({
        ok: false,
        error: "rate_limit_exceeded",
        message: "Too many requests",
        request_id: request.requestId || request.id || null,
      });
    }
  };
}

// Periodic cleanup of expired windows (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60_000; // 10 minutes
  for (const [key, entry] of windows) {
    if (now - entry.windowStart > maxAge) {
      windows.delete(key);
    }
  }
}, 5 * 60_000).unref();
