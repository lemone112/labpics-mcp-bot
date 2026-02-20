/**
 * Simple in-memory sliding window rate limiter.
 * No external dependencies — suitable for single-instance deployment.
 */

import { ApiError, sendError } from "./api-contract.js";

const windows = new Map();
const MAX_RATE_LIMIT_ENTRIES = 50_000;

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
    if (!entry && windows.size >= MAX_RATE_LIMIT_ENTRIES) {
      // Evict oldest entries to prevent unbounded growth
      const maxAge = 10 * 60_000;
      for (const [k, v] of windows) {
        if (now - v.windowStart > maxAge) windows.delete(k);
      }
      // If still over capacity, drop oldest quarter
      if (windows.size >= MAX_RATE_LIMIT_ENTRIES) {
        const toRemove = Math.floor(windows.size / 4);
        let removed = 0;
        for (const k of windows.keys()) {
          if (removed >= toRemove) break;
          windows.delete(k);
          removed++;
        }
      }
    }
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
 * Redis-backed rate limit check (INCR + EXPIRE).
 * Falls back to in-memory if Redis call fails.
 */
async function checkRateLimitRedis(redisClient, key, maxRequests, windowMs) {
  const redisKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const count = await redisClient.incr(redisKey);
    if (count === 1) {
      await redisClient.expire(redisKey, windowSec);
    }
    if (count > maxRequests) {
      const ttl = await redisClient.ttl(redisKey);
      const retryAfterMs = ttl > 0 ? ttl * 1000 : windowMs;
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    return { allowed: true, remaining: maxRequests - count, retryAfterMs: 0 };
  } catch {
    return checkRateLimit(key, maxRequests, windowMs);
  }
}

/**
 * Create a Fastify preHandler hook for rate limiting.
 * When redisClient is provided, uses distributed Redis rate limiting;
 * falls back to in-memory when Redis is unavailable.
 * @param {{ maxRequests?: number, windowMs?: number, keyFn?: (request: any) => string, redisClient?: object | null }} options
 */
export function rateLimitHook(options = {}) {
  const {
    maxRequests = 30,
    windowMs = 60_000,
    keyFn = (request) => `${request.ip}:${request.url}`,
    redisClient = null,
  } = options;

  return async (request, reply) => {
    const key = keyFn(request);
    const result = redisClient
      ? await checkRateLimitRedis(redisClient, key, maxRequests, windowMs)
      : checkRateLimit(key, maxRequests, windowMs);

    reply.header("X-RateLimit-Limit", maxRequests);
    reply.header("X-RateLimit-Remaining", Math.max(0, result.remaining));

    if (!result.allowed) {
      reply.header("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      return sendError(reply, request.requestId || request.id, new ApiError(429, "rate_limit_exceeded", "Too many requests"));
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
