"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const JOB_TO_QUERY_KEYS: Record<string, Array<readonly string[]>> = {
  connectors_sync_cycle: [["portfolio"], ["messages"]],
  signals_extraction: [["portfolio"], ["recommendations"]],
  health_scoring: [["portfolio"]],
  analytics_aggregates: [["portfolio"]],
  embeddings_run: [["portfolio"]],
};

type UseSseInvalidationParams = {
  lastEvent: { status?: string; job_type?: string } | null;
};

/**
 * Maps SSE job_completed events to react-query cache invalidation.
 */
export function useSseInvalidation({ lastEvent }: UseSseInvalidationParams) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.status !== "ok") return;

    const queryKeys = JOB_TO_QUERY_KEYS[lastEvent.job_type || ""];
    if (!queryKeys) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [lastEvent, queryClient]);
}
