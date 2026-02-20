import { Redis } from "ioredis";
import type { Logger } from "../types/index.js";

interface RedisClientOptions {
  url?: string;
  logger?: Logger | Console;
  name?: string;
}

export function createRedisClient({ url, logger = console, name = "redis" }: RedisClientOptions = {}): Redis | null {
  const redisUrl = url || process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info({ name }, "REDIS_URL not set — Redis disabled, falling back to pg_notify");
    return null;
  }

  const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || "", 10) || 20;

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > maxRetries) return null;
      const baseMs = Math.min(times * 500, 30_000);
      const jitter = Math.floor(Math.random() * Math.min(times * 100, 2000));
      return baseMs + jitter;
    },
    lazyConnect: false,
    connectionName: name,
    enableReadyCheck: true,
    reconnectOnError(err: Error) {
      const msg = String(err?.message || "");
      return msg.includes("READONLY") || msg.includes("ECONNRESET");
    },
  });

  client.on("connect", () => {
    logger.info({ name }, "redis connected");
  });

  client.on("ready", () => {
    logger.info({ name }, "redis ready");
  });

  client.on("error", (err: Error) => {
    logger.error({ name, error: String(err?.message || err) }, "redis connection error");
  });

  client.on("close", () => {
    logger.info({ name }, "redis connection closed");
  });

  client.on("reconnecting", (delay: number) => {
    logger.info({ name, delay }, "redis reconnecting");
  });

  return client;
}
