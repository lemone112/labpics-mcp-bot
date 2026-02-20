import crypto from "node:crypto";
import { createRedisClient } from "./redis.js";
import type { Logger } from "../types/index.js";

export interface CacheLayer {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidateByPrefix(prefix: string): Promise<number>;
  getStats(): CacheStats;
  close(): Promise<void>;
  enabled: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  enabled: boolean;
}

export function createCacheLayer({ logger = console }: { logger?: Logger | Console } = {}): CacheLayer {
  const client = createRedisClient({ logger, name: "redis-cache" });
  const enabled = Boolean(client);

  const stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
  };

  async function get(key: string): Promise<unknown> {
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
      logger.warn({ key, error: String((err as Error)?.message || err) }, "cache get failed");
      return null;
    }
  }

  async function set(key: string, value: unknown, ttlSeconds = 90): Promise<void> {
    if (!client) return;
    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      stats.sets++;
    } catch (err) {
      logger.warn({ key, error: String((err as Error)?.message || err) }, "cache set failed");
    }
  }

  async function del(key: string): Promise<void> {
    if (!client) return;
    try {
      await client.del(key);
      stats.invalidations++;
    } catch (err) {
      logger.warn({ key, error: String((err as Error)?.message || err) }, "cache del failed");
    }
  }

  async function invalidateByPrefix(prefix: string): Promise<number> {
    if (!client) return 0;
    let deleted = 0;
    try {
      const stream = client.scanStream({ match: `${prefix}*`, count: 100 });
      for await (const keys of stream) {
        if ((keys as string[]).length > 0) {
          await client.del(...(keys as string[]));
          deleted += (keys as string[]).length;
        }
      }
      stats.invalidations += deleted;
    } catch (err) {
      logger.warn({ prefix, error: String((err as Error)?.message || err) }, "cache invalidateByPrefix failed");
    }
    return deleted;
  }

  function getStats(): CacheStats {
    return { ...stats, enabled };
  }

  async function close(): Promise<void> {
    if (!client) return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  return { get, set, del, invalidateByPrefix, getStats, close, enabled };
}

export function cacheKeyHash(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);
}
