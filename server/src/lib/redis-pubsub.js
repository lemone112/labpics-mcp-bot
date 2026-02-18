import { createRedisClient } from "./redis.js";

/**
 * Redis Pub/Sub wrapper.
 *
 * Creates two Redis connections:
 *  - publisher: used by worker/server to publish events
 *  - subscriber: used by server to listen for events and push via SSE
 *
 * Falls back gracefully to no-op if Redis is unavailable.
 */
export function createRedisPubSub({ url, logger = console } = {}) {
  const publisher = createRedisClient({ url, logger, name: "redis-pub" });
  const subscriber = createRedisClient({ url, logger, name: "redis-sub" });
  const callbacks = new Map(); // channel -> Set<callback>

  const enabled = Boolean(publisher && subscriber);

  /**
   * Publish a message to a channel.
   * @param {string} channel
   * @param {string} message - JSON string
   */
  async function publish(channel, message) {
    if (!publisher) return 0;
    try {
      return await publisher.publish(channel, message);
    } catch (err) {
      logger.warn({ channel, error: String(err?.message || err) }, "redis publish failed");
      return 0;
    }
  }

  /**
   * Subscribe to a channel and register a callback.
   * @param {string} channel
   * @param {(data: object, channel: string) => void} callback
   * @returns {() => void} unsubscribe function
   */
  async function subscribe(channel, callback) {
    if (!subscriber) return () => {};

    if (!callbacks.has(channel)) {
      callbacks.set(channel, new Set());
      await subscriber.subscribe(channel);
    }
    callbacks.get(channel).add(callback);

    return () => {
      callbacks.get(channel)?.delete(callback);
      if (callbacks.get(channel)?.size === 0) {
        callbacks.delete(channel);
        subscriber.unsubscribe(channel).catch(() => {});
      }
    };
  }

  // Route incoming messages to registered callbacks
  if (subscriber) {
    subscriber.on("message", (channel, message) => {
      const channelCallbacks = callbacks.get(channel);
      if (!channelCallbacks || channelCallbacks.size === 0) return;

      let parsed = null;
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
            { channel, error: String(err?.message || err) },
            "redis subscriber callback error"
          );
        }
      }
    });
  }

  async function close() {
    if (publisher) {
      try { await publisher.quit(); } catch { publisher.disconnect(); }
    }
    if (subscriber) {
      try { await subscriber.quit(); } catch { subscriber.disconnect(); }
    }
  }

  return { publish, subscribe, close, enabled };
}
