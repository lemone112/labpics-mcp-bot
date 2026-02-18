import crypto from "node:crypto";
import { createRedisClient } from "./redis.js";

/**
 * Create a cache layer backed by Redis.
 * Graceful degradation: if Redis is unavailable, all operations are no-ops.
 *
 * @param {{ logger?: object }} options
 * @returns {object} cache API
 */
export function createCacheLayer({ logger = console } = {}) {
  const client = createRedisClient({ logger, name: "redis-cache" });
  const enabled = Boolean(client);

  const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
  };

  /**
   * @param {string} key
   * @returns {*|null} parsed value or null
   */
  async function get(key) {
    if (!client) return null;
    try {
      const raw = await client.get(key);
      if (raw === null) {
        stats.misses++;
        return null;
      }
      stats.hits++;
      return JSON.parse(raw);
    } catch (err) {
      stats.misses++;
      logger.warn({ key, error: String(err?.message || err) }, "cache get failed");
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {*} value — must be JSON-serializable
   * @param {number} [ttlSeconds=90]
   */
  async function set(key, value, ttlSeconds = 90) {
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      stats.sets++;
    } catch (err) {
      logger.warn({ key, error: String(err?.message || err) }, "cache set failed");
    }
  }

  /**
   * @param {string} key
   */
  async function del(key) {
    if (!client) return;
    try {
      await client.del(key);
      stats.invalidations++;
    } catch (err) {
      logger.warn({ key, error: String(err?.message || err) }, "cache del failed");
    }
  }

  /**
   * Delete all keys matching a prefix using SCAN (non-blocking).
   * @param {string} prefix e.g. "portfolio:42"
   * @returns {number} count of deleted keys
   */
  async function invalidateByPrefix(prefix) {
    if (!client) return 0;
    let deleted = 0;
    try {
      const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
      for await (const keys of stream) {
        if (keys.length > 0) {
          await client.del(...keys);
          deleted += keys.length;
        }
      }
      stats.invalidations += deleted;
    } catch (err) {
      logger.warn({ prefix, error: String(err?.message || err) }, "cache invalidateByPrefix failed");
    }
    return deleted;
  }

  function getStats() {
    return { ...stats, enabled };
  }

  async function close() {
    if (!client) return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  return { get, set, del, invalidateByPrefix, getStats, close, enabled };
}

/**
 * Hash helper for cache keys — deterministic short hash.
 * @param  {...string} parts
 * @returns {string} 12-char hex hash
 */
export function cacheKeyHash(...parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);
}
