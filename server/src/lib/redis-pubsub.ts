import { createRedisClient } from "./redis.js";
import type { Logger } from "../types/index.js";

export interface RedisPubSub {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (data: unknown, channel: string) => void): Promise<() => void>;
  close(): Promise<void>;
  enabled: boolean;
}

interface PubSubOptions {
  url?: string;
  logger?: Logger | Console;
}

export function createRedisPubSub({ url, logger = console }: PubSubOptions = {}): RedisPubSub {
  const publisher = createRedisClient({ url, logger, name: "redis-pub" });
  const subscriber = createRedisClient({ url, logger, name: "redis-sub" });
  const callbacks = new Map<string, Set<(data: unknown, channel: string) => void>>();

  const enabled = Boolean(publisher && subscriber);

  async function publish(channel: string, message: string): Promise<number> {
    if (!publisher) return 0;
    try {
      return await publisher.publish(channel, message);
    } catch (err) {
      logger.warn({ channel, error: String((err as Error)?.message || err) }, "redis publish failed");
      return 0;
    }
  }

  async function subscribe(channel: string, callback: (data: unknown, channel: string) => void): Promise<() => void> {
    if (!subscriber) return () => {};

    if (!callbacks.has(channel)) {
      callbacks.set(channel, new Set());
      await subscriber.subscribe(channel);
    }
    callbacks.get(channel)!.add(callback);

    return () => {
      callbacks.get(channel)?.delete(callback);
      if (callbacks.get(channel)?.size === 0) {
        callbacks.delete(channel);
        subscriber.unsubscribe(channel).catch(() => {});
      }
    };
  }

  if (subscriber) {
    subscriber.on("message", (channel: string, message: string) => {
      const channelCallbacks = callbacks.get(channel);
      if (!channelCallbacks || channelCallbacks.size === 0) return;

      let parsed: unknown = null;
      try {
        parsed = message ? JSON.parse(message) : {};
      } catch {
        parsed = { raw: message };
      }

      for (const cb of channelCallbacks) {
        try {
          cb(parsed, channel);
        } catch (err) {
          logger.error(
            { channel, error: String((err as Error)?.message || err) },
            "redis subscriber callback error"
          );
        }
      }
    });
  }

  async function close(): Promise<void> {
    if (publisher) {
      try { await publisher.quit(); } catch { publisher.disconnect(); }
    }
    if (subscriber) {
      try { await subscriber.quit(); } catch { subscriber.disconnect(); }
    }
  }

  return { publish, subscribe, close, enabled };
}
