"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Maps SSE job_completed events to react-query cache invalidation.
 * When a job completes, invalidates the relevant query keys so
 * components using useQuery() automatically refetch.
 *
 * This replaces the old useRealtimeRefresh → reload() pattern.
 */
const JOB_TO_QUERY_KEYS = {
  connectors_sync_cycle: [["portfolio"], ["messages"]],
  signals_extraction: [["portfolio"], ["recommendations"]],
  health_scoring: [["portfolio"]],
  analytics_aggregates: [["portfolio"]],
  embeddings_run: [["portfolio"]],
};

export function useSseInvalidation({ lastEvent }) {
  const queryClient = useQueryClient();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.status !== "ok") return;

    const queryKeys = JOB_TO_QUERY_KEYS[lastEvent.job_type];
    if (!queryKeys) return;

    // Debounce 500ms to batch rapid cascade completions
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [lastEvent, queryClient]);
}
