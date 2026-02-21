"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type Notification = Record<string, unknown>;
type NotificationCategory = string;

const NOTIFICATION_KEYS = {
  all: ["notifications"] as const,
  list: (filters: unknown) => ["notifications", "list", filters] as const,
  count: () => ["notifications", "count"] as const,
};

export function useNotificationCount(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: NOTIFICATION_KEYS.count(),
    queryFn: async () => {
      const data = await apiFetch("/notifications/count");
      return { unreadCount: (data as { unreadCount?: number } | null)?.unreadCount ?? 0 };
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

export function useNotifications(options: {
  page?: number;
  pageSize?: number;
  category?: NotificationCategory | null;
  unreadOnly?: boolean;
  enabled?: boolean;
} = {}) {
  const {
    page = 1,
    pageSize = 20,
    category = null,
    unreadOnly = false,
    enabled = true,
  } = options;

  const filters = useMemo(
    () => ({ page, pageSize, category, unreadOnly }),
    [page, pageSize, category, unreadOnly]
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
        notifications: Array.isArray((data as { notifications?: unknown[] } | null)?.notifications)
          ? ((data as { notifications: unknown[] }).notifications as Notification[])
          : [],
        unreadCount: (data as { unreadCount?: number } | null)?.unreadCount ?? 0,
        totalCount: (data as { totalCount?: number } | null)?.totalCount ?? 0,
        hasMore: (data as { hasMore?: boolean } | null)?.hasMore ?? false,
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

export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
  }, [queryClient]);

  const markRead = useMutation({
    mutationFn: async (ids: string[] | string) => {
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
    mutationFn: async (id: string) => {
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
