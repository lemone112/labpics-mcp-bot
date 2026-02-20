"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Query Keys ────────────────────────────────────────────────

const NOTIFICATION_KEYS = {
  all: ["notifications"],
  list: (filters) => ["notifications", "list", filters],
  count: () => ["notifications", "count"],
};

// ── useNotificationCount — lightweight badge counter ──────────

/**
 * Polls for unread notification count.
 * Used by the bell icon in the header.
 *
 * @param {{ enabled?: boolean }} options
 */
export function useNotificationCount(options = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.count(),
    queryFn: async () => {
      const data = await apiFetch("/notifications/count");
      return { unreadCount: data?.unreadCount ?? 0 };
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  return {
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

// ── useNotifications — full notification list ─────────────────

/**
 * Fetches paginated notification list for the notification center.
 *
 * @param {{
 *   page?: number,
 *   pageSize?: number,
 *   category?: import("@/types/notifications").NotificationCategory | null,
 *   unreadOnly?: boolean,
 *   enabled?: boolean,
 * }} options
 */
export function useNotifications(options = {}) {
  const {
    page = 1,
    pageSize = 20,
    category = null,
    unreadOnly = false,
    enabled = true,
  } = options;

  const filters = useMemo(
    () => ({ page, pageSize, category, unreadOnly }),
    [page, pageSize, category, unreadOnly],
  );

  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (category) params.set("category", category);
      if (unreadOnly) params.set("unread_only", "true");

      const data = await apiFetch(`/notifications?${params.toString()}`);
      return {
        notifications: Array.isArray(data?.notifications) ? data.notifications : [],
        unreadCount: data?.unreadCount ?? 0,
        totalCount: data?.totalCount ?? 0,
        hasMore: data?.hasMore ?? false,
      };
    },
    enabled,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    totalCount: query.data?.totalCount ?? 0,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── useNotificationMutations ──────────────────────────────────

/**
 * Provides mutation functions for notifications.
 */
export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: async (ids) => {
      return apiFetch("/notifications/read", {
        method: "POST",
        body: { ids: Array.isArray(ids) ? ids : [ids] },
      });
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      return apiFetch("/notifications/read-all", { method: "POST" });
    },
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: async (id) => {
      return apiFetch(`/notifications/${id}`, { method: "DELETE" });
    },
    onSuccess: invalidate,
  });

  return {
    markRead,
    markAllRead,
    dismiss,
    isUpdating: markRead.isPending || markAllRead.isPending || dismiss.isPending,
  };
}

export { NOTIFICATION_KEYS };
