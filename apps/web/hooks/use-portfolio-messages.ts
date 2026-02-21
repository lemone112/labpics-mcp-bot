"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

type UsePortfolioMessagesParams = {
  projectId: string | null;
  contactGlobalId: string | null;
  enabled?: boolean;
  limit?: number;
  sseConnected?: boolean;
};

export function usePortfolioMessages({
  projectId,
  contactGlobalId,
  enabled = true,
  limit = 250,
  sseConnected = false,
}: UsePortfolioMessagesParams) {
  const normalizedProjectId = useMemo(() => String(projectId || "").trim(), [projectId]);
  const normalizedContactId = useMemo(() => String(contactGlobalId || "").trim(), [contactGlobalId]);

  const query = useQuery({
    queryKey: ["messages", normalizedProjectId, normalizedContactId, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        project_id: normalizedProjectId,
        limit: String(limit),
      });
      if (normalizedContactId) {
        params.set("contact_global_id", normalizedContactId);
      }
      return apiFetch(`/portfolio/messages?${params.toString()}`);
    },
    enabled: enabled && Boolean(normalizedProjectId),
    refetchInterval: sseConnected ? false : 20_000,
  });

  return {
    payload: query.data ?? null,
    loading: query.isLoading,
    error: (query.error as { message?: string } | null)?.message || "",
    reload: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
