"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_TIMEOUT_MS = 60_000;

type StreamEvent = Record<string, unknown> | null;

type UseEventStreamOptions = {
  enabled?: boolean;
  key?: string;
};

/**
 * Connects to SSE endpoint with reconnect + heartbeat timeout.
 */
export function useEventStream({ enabled = true, key = "" }: UseEventStreamOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<StreamEvent>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cleanedUpRef = useRef(false);

  const cleanup = useCallback(() => {
    cleanedUpRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
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

    function scheduleReconnect() {
      if (cleanedUpRef.current) return;
      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;

      const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attemptRef.current), BACKOFF_MAX_MS);
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    function resetHeartbeat() {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setTimeout(() => {
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

      let source: EventSource;
      try {
        source = new EventSource(url, { withCredentials: true });
      } catch (error) {
        console.warn("[sse] EventSource init failed", { url, error: String((error as Error)?.message || error) });
        return;
      }
      sourceRef.current = source;

      source.addEventListener("connected", () => {
        attemptRef.current = 0;
        setConnected(true);
        resetHeartbeat();
      });

      source.addEventListener("job_completed", (event: MessageEvent<string>) => {
        resetHeartbeat();
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;
          setLastEvent(data);
        } catch (error) {
          console.warn("[sse] malformed job_completed payload", {
            error: String((error as Error)?.message || error),
          });
        }
      });

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

    connect();
    return cleanup;
  }, [enabled, key, cleanup]);

  return { connected, lastEvent };
}
