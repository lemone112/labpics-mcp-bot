"use client";

import { useEffect, useRef } from "react";

/**
 * Maps job completion events to specific data reload calls.
 *
 * When a `job_completed` event arrives for a matching job type,
 * the reload function is called after a short debounce to batch
 * rapid cascade completions.
 */
const JOB_TO_DATA_MAP = {
  connectors_sync_cycle: ["portfolio", "messages"],
  signals_extraction: ["portfolio", "recommendations"],
  health_scoring: ["portfolio"],
  kag_recommendations_refresh: ["recommendations"],
  kag_v2_recommendations_refresh: ["recommendations"],
  analytics_aggregates: ["portfolio"],
  embeddings_run: ["portfolio"],
};

/**
 * @param {{ lastEvent: object|null, reload: () => Promise<any>, dataType: string }} params
 */
export function useRealtimeRefresh({ lastEvent, reload, dataType }) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.status !== "ok") return;

    const relevantDataTypes = JOB_TO_DATA_MAP[lastEvent.job_type] || [];
    if (!relevantDataTypes.includes(dataType)) return;

    // Debounce: wait 500ms to batch rapid cascading completions
    const timer = setTimeout(() => {
      reloadRef.current?.();
    }, 500);

    return () => clearTimeout(timer);
  }, [lastEvent, dataType]);
}
