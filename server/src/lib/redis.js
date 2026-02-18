import Redis from "ioredis";

/**
 * Create a Redis client from REDIS_URL.
 * Returns null if REDIS_URL is not configured (graceful degradation).
 *
 * @param {{ url?: string, logger?: object, name?: string }} options
 * @returns {import("ioredis").Redis | null}
 */
export function createRedisClient({ url, logger = console, name = "redis" } = {}) {
  const redisUrl = url || process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info({ name }, "REDIS_URL not set — Redis disabled, falling back to pg_notify");
    return null;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 500, 5000);
    },
    lazyConnect: false,
    connectionName: name,
  });

  client.on("connect", () => {
    logger.info({ name }, "redis connected");
  });

  client.on("error", (err) => {
    logger.error({ name, error: String(err?.message || err) }, "redis connection error");
  });

  client.on("close", () => {
    logger.info({ name }, "redis connection closed");
  });

  return client;
}
