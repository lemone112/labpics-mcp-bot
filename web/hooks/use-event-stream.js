"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Connects to the SSE endpoint and exposes real-time events.
 * Implements exponential backoff reconnection and heartbeat timeout.
 * After MAX_RECONNECT_ATTEMPTS, gives up (falls back to polling-only).
 *
 * @param {{ enabled?: boolean, key?: string }} options
 * @param options.key — change this value (e.g. projectId) to force reconnect
 */
export function useEventStream({ enabled = true, key = "" } = {}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const sourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const attemptRef = useRef(0);
  const cleanedUpRef = useRef(false);

  const cleanup = useCallback(() => {
    cleanedUpRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    clearTimeout(heartbeatTimerRef.current);
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    cleanedUpRef.current = false;
    attemptRef.current = 0;
    const sseBase = process.env.NEXT_PUBLIC_SSE_URL || API_BASE;
    const url = `${sseBase}/events/stream`;

    function resetHeartbeat() {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setTimeout(() => {
        // No data for 60s — force reconnect
        if (sourceRef.current) {
          sourceRef.current.close();
          sourceRef.current = null;
        }
        setConnected(false);
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    }

    function connect() {
      if (cleanedUpRef.current) return;

      let source;
      try {
        source = new EventSource(url, { withCredentials: true });
      } catch {
        // EventSource not supported or URL invalid — degrade silently
        return;
      }
      sourceRef.current = source;

      source.addEventListener("connected", () => {
        attemptRef.current = 0;
        setConnected(true);
        resetHeartbeat();
      });

      source.addEventListener("job_completed", (event) => {
        resetHeartbeat();
        try {
          const data = JSON.parse(event.data);
          setLastEvent(data);
        } catch {
          // ignore malformed events
        }
      });

      // Reset heartbeat on any message (including heartbeat pings)
      source.onmessage = () => {
        resetHeartbeat();
      };

      source.onerror = () => {
        setConnected(false);
        if (sourceRef.current) {
          sourceRef.current.close();
          sourceRef.current = null;
        }
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (cleanedUpRef.current) return;
      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;

      const delay = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, attemptRef.current),
        BACKOFF_MAX_MS,
      );
      attemptRef.current += 1;

      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    connect();

    return cleanup;
  }, [enabled, key, cleanup]);

  return { connected, lastEvent };
}
