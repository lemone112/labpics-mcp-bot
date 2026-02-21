import { createRedisClient } from "./redis.js";
import type { Logger } from "../types/index.js";

export interface RedisPubSub {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (data: unknown, channel: string) => void): Promise<() => void>;
  close(): Promise<void>;
  getStats(): {
    publish_total: number;
    publish_failed_total: number;
    published_recipients_total: number;
    received_messages_total: number;
    callback_errors_total: number;
    subscribed_channels: number;
  };
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
  const stats = {
    publish_total: 0,
    publish_failed_total: 0,
    published_recipients_total: 0,
    received_messages_total: 0,
    callback_errors_total: 0,
  };

  async function publish(channel: string, message: string): Promise<number> {
    if (!publisher) return 0;
    try {
      const delivered = await publisher.publish(channel, message);
      stats.publish_total += 1;
      stats.published_recipients_total += Number(delivered || 0);
      return delivered;
    } catch (err) {
      stats.publish_failed_total += 1;
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
        subscriber.unsubscribe(channel).catch((err: unknown) => {
          logger.warn(
            { channel, error: String((err as Error)?.message || err) },
            "redis unsubscribe failed"
          );
        });
      }
    };
  }

  if (subscriber) {
    subscriber.on("message", (channel: string, message: string) => {
      const channelCallbacks = callbacks.get(channel);
      if (!channelCallbacks || channelCallbacks.size === 0) return;
      stats.received_messages_total += 1;

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
          stats.callback_errors_total += 1;
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

  function getStats() {
    return {
      publish_total: stats.publish_total,
      publish_failed_total: stats.publish_failed_total,
      published_recipients_total: stats.published_recipients_total,
      received_messages_total: stats.received_messages_total,
      callback_errors_total: stats.callback_errors_total,
      subscribed_channels: callbacks.size,
    };
  }

  return { publish, subscribe, close, getStats, enabled };
}
