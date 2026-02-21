"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AutoRefreshOptions = {
  enabled?: boolean;
  sseConnected?: boolean;
  onError?: (error: unknown) => void;
};

type AutoRefreshState = {
  lastRefreshedAt: Date | null;
  secondsAgo: number | null;
  paused: boolean;
  pause: () => void;
  resume: () => void;
  markRefreshed: () => void;
};

/**
 * Wraps a reload/refetch function with an interval timer.
 */
export function useAutoRefresh(
  fetchFn: () => Promise<unknown>,
  intervalMs: number,
  options: AutoRefreshOptions = {}
): AutoRefreshState {
  const { enabled = true, sseConnected = false, onError } = options;
  // When SSE is active, disable polling entirely — real-time updates via SSE.
  // Tab-refocus stale check below still works as a safety net.
  const effectiveInterval = sseConnected ? 0 : intervalMs;
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef(fetchFn);
  const fetchingRef = useRef(false);
  const lastRefreshedAtRef = useRef<Date | null>(null);

  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled || paused || effectiveInterval <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    intervalRef.current = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        await fetchRef.current();
        const now = new Date();
        setLastRefreshedAt(now);
        lastRefreshedAtRef.current = now;
      } catch (error) {
        onError?.(error);
      } finally {
        fetchingRef.current = false;
      }
    }, effectiveInterval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [enabled, paused, effectiveInterval, onError]);

  // 5-second ticker to compute secondsAgo display (reduced from 1s to cut re-renders 5x)
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const ts = lastRefreshedAtRef.current;
      if (!ts) return;
      setSecondsAgo(Math.floor((Date.now() - ts.getTime()) / 1000));
    }, 5000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  // On tab refocus: if stale, refetch immediately
  useEffect(() => {
    if (!enabled) return undefined;
    const onVisibilityChange = () => {
      if (typeof document === "undefined" || document.hidden) return;
      const ts = lastRefreshedAtRef.current;
      // Use base intervalMs (not effectiveInterval) so stale check works even when SSE disables polling
      if (ts && Date.now() - ts.getTime() > intervalMs) {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        fetchRef.current()
          .then(() => {
            const now = new Date();
            setLastRefreshedAt(now);
            lastRefreshedAtRef.current = now;
          })
          .catch((error) => {
            onError?.(error);
          })
          .finally(() => {
            fetchingRef.current = false;
          });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, intervalMs, onError]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const markRefreshed = useCallback(() => {
    const now = new Date();
    setLastRefreshedAt(now);
    lastRefreshedAtRef.current = now;
    setSecondsAgo(0);
  }, []);

  return { lastRefreshedAt, secondsAgo, paused, pause, resume, markRefreshed };
}
