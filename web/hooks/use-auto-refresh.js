"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wraps a reload/refetch function with an interval timer.
 *
 * @param {() => Promise<any>} fetchFn - The reload function to call periodically
 * @param {number} intervalMs - Polling interval in milliseconds
 * @param {{ enabled?: boolean, sseConnected?: boolean }} options
 * @returns {{ lastRefreshedAt: Date|null, secondsAgo: number|null, paused: boolean, pause: () => void, resume: () => void, markRefreshed: () => void }}
 */
export function useAutoRefresh(fetchFn, intervalMs, options = {}) {
  const { enabled = true, sseConnected = false } = options;
  // When SSE is active, disable polling entirely — real-time updates via SSE.
  // Tab-refocus stale check below still works as a safety net.
  const effectiveInterval = sseConnected ? 0 : intervalMs;
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(null);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef(null);
  const tickRef = useRef(null);
  const fetchRef = useRef(fetchFn);
  const fetchingRef = useRef(false);
  const lastRefreshedAtRef = useRef(null);

  useEffect(() => {
    fetchRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled || paused || effectiveInterval <= 0) {
      clearInterval(intervalRef.current);
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
      } catch {
        // swallow — the hook's own error state handles display
      } finally {
        fetchingRef.current = false;
      }
    }, effectiveInterval);

    return () => clearInterval(intervalRef.current);
  }, [enabled, paused, effectiveInterval]);

  // 5-second ticker to compute secondsAgo display (reduced from 1s to cut re-renders 5×)
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const ts = lastRefreshedAtRef.current;
      if (!ts) return;
      setSecondsAgo(Math.floor((Date.now() - ts.getTime()) / 1000));
    }, 5000);
    return () => clearInterval(tickRef.current);
  }, []);

  // On tab refocus: if stale, refetch immediately
  useEffect(() => {
    if (!enabled) return;
    function onVisibilityChange() {
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
          .catch(() => {})
          .finally(() => { fetchingRef.current = false; });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, intervalMs]);

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
