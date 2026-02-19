"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { normalizeProjectIds } from "@/lib/utils";

export function usePortfolioOverview({ projectIds, enabled = true, messageLimit = 60, cardLimit = 24, sseConnected = false }) {
  const ids = useMemo(() => normalizeProjectIds(projectIds), [projectIds]);
  const idsParam = useMemo(() => ids.join(","), [ids]);

  const query = useQuery({
    queryKey: ["portfolio", idsParam, messageLimit, cardLimit],
    queryFn: () =>
      apiFetch(
        `/portfolio/overview?project_ids=${encodeURIComponent(idsParam)}&message_limit=${messageLimit}&card_limit=${cardLimit}`
      ),
    enabled: enabled && ids.length > 0,
    // When SSE is connected, rely on cache invalidation from useSseInvalidation.
    // When SSE is down, poll every 30s as fallback.
    refetchInterval: sseConnected ? false : 30_000,
  });

  return {
    payload: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message || "",
    reload: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
