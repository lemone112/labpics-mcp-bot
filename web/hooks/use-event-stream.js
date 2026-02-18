"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * Connects to the SSE endpoint and exposes real-time events.
 * Falls back gracefully if SSE is unavailable.
 *
 * @param {{ enabled?: boolean }} options
 */
export function useEventStream({ enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
        setConnected(false);
      }
      return;
    }

    const sseBase = process.env.NEXT_PUBLIC_SSE_URL || API_BASE;
    const url = `${sseBase}/events/stream`;

    let source;
    try {
      source = new EventSource(url, { withCredentials: true });
    } catch {
      // EventSource not supported or URL invalid — degrade silently
      return;
    }
    sourceRef.current = source;

    source.addEventListener("connected", () => {
      setConnected(true);
    });

    source.addEventListener("job_completed", (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);
      } catch {
        // ignore malformed events
      }
    });

    source.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects by default
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  return { connected, lastEvent };
}
