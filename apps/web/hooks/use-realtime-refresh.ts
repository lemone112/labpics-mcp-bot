"use client";

import { useEffect, useRef } from "react";

const JOB_TO_DATA_MAP: Record<string, string[]> = {
  connectors_sync_cycle: ["portfolio", "messages"],
  signals_extraction: ["portfolio", "recommendations"],
  health_scoring: ["portfolio"],
  analytics_aggregates: ["portfolio"],
  embeddings_run: ["portfolio"],
};

type UseRealtimeRefreshParams = {
  lastEvent: { status?: string; job_type?: string } | null;
  reload: () => Promise<unknown> | void;
  dataType: string;
};

/**
 * Maps job completion events to specific data reload calls.
 */
export function useRealtimeRefresh({ lastEvent, reload, dataType }: UseRealtimeRefreshParams) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.status !== "ok") return;

    const relevantDataTypes = JOB_TO_DATA_MAP[lastEvent.job_type || ""] || [];
    if (!relevantDataTypes.includes(dataType)) return;

    const timer = setTimeout(() => {
      void reloadRef.current?.();
    }, 500);

    return () => clearTimeout(timer);
  }, [lastEvent, dataType]);
}
