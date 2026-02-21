"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ActionQueueItem = Record<string, unknown>;

type ActionQueueFilters = {
  status?: string[];
  category?: string[];
  priority?: string[];
  projectId?: string | null;
  assigneeId?: string | null;
  search?: string;
};

type ActionQueueSort = {
  field?: string;
  direction?: "asc" | "desc";
};

type ActionQueueCounts = {
  total: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
};

const ACTION_QUEUE_KEYS = {
  all: ["action-queue"] as const,
  list: (filters: unknown) => ["action-queue", "list", filters] as const,
  counts: () => ["action-queue", "counts"] as const,
  item: (id: string) => ["action-queue", "item", id] as const,
};

const DEFAULT_FILTERS: Required<ActionQueueFilters> = {
  status: ["pending", "in_progress"],
  category: [],
  priority: [],
  projectId: null,
  assigneeId: null,
  search: "",
};

const DEFAULT_SORT: Required<ActionQueueSort> = {
  field: "priority",
  direction: "desc",
};

function buildQueryParams(
  filters: Required<ActionQueueFilters>,
  sort: Required<ActionQueueSort>,
  page: number,
  pageSize: number
) {
  const params = new URLSearchParams();

  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.category?.length) params.set("category", filters.category.join(","));
  if (filters.priority?.length) params.set("priority", filters.priority.join(","));
  if (filters.projectId) params.set("project_id", filters.projectId);
  if (filters.assigneeId) params.set("assignee_id", filters.assigneeId);
  if (filters.search) params.set("q", filters.search);
  if (sort.field) {
    params.set("sort", sort.field);
    params.set("dir", sort.direction || "desc");
  }
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  return params.toString();
}

export function useActionQueue(options: {
  filters?: ActionQueueFilters;
  sort?: ActionQueueSort;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
} = {}) {
  const {
    filters = DEFAULT_FILTERS,
    sort = DEFAULT_SORT,
    page = 1,
    pageSize = 20,
    enabled = true,
  } = options;

  const stableFilters = useMemo<Required<ActionQueueFilters>>(
    () => ({ ...DEFAULT_FILTERS, ...filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.status?.join(","),
      filters.category?.join(","),
      filters.priority?.join(","),
      filters.projectId,
      filters.assigneeId,
      filters.search,
    ]
  );

  const stableSort = useMemo<Required<ActionQueueSort>>(
    () => ({ ...DEFAULT_SORT, ...sort }),
    [sort.field, sort.direction]
  );

  const queryKey = ACTION_QUEUE_KEYS.list({ ...stableFilters, ...stableSort, page, pageSize });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const qs = buildQueryParams(stableFilters, stableSort, page, pageSize);
      const data = await apiFetch(`/action-queue?${qs}`);
      return {
        items: Array.isArray((data as { items?: unknown[] } | null)?.items) ? (data as { items: unknown[] }).items : [],
        total: (data as { total?: number } | null)?.total ?? 0,
        page: (data as { page?: number } | null)?.page ?? page,
        pageSize: (data as { pageSize?: number } | null)?.pageSize ?? pageSize,
        hasMore: (data as { hasMore?: boolean } | null)?.hasMore ?? false,
      };
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  return {
    items: (query.data?.items as ActionQueueItem[]) ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    pageSize: query.data?.pageSize ?? pageSize,
    hasMore: query.data?.hasMore ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useActionQueueCounts(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: ACTION_QUEUE_KEYS.counts(),
    queryFn: async () => {
      const data = await apiFetch("/action-queue/counts");
      return {
        total: (data as { total?: number } | null)?.total ?? 0,
        byCategory: (data as { byCategory?: Record<string, number> } | null)?.byCategory ?? {},
        byPriority: (data as { byPriority?: Record<string, number> } | null)?.byPriority ?? {},
        overdue: (data as { overdue?: number } | null)?.overdue ?? 0,
      } as ActionQueueCounts;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    counts: query.data ?? { total: 0, byCategory: {}, byPriority: {}, overdue: 0 },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useActionQueueMutations() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ACTION_QUEUE_KEYS.all });
  }, [queryClient]);

  const updateAction = useMutation({
    mutationFn: async ({ id, update }: { id: string; update: Record<string, unknown> }) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: update,
      });
    },
    onSuccess: invalidate,
  });

  const completeAction = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "completed" },
      });
    },
    onSuccess: invalidate,
  });

  const dismissAction = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "dismissed" },
      });
    },
    onSuccess: invalidate,
  });

  const snoozeAction = useMutation({
    mutationFn: async ({ id, snoozedUntil }: { id: string; snoozedUntil: string }) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "snoozed", snoozedUntil },
      });
    },
    onSuccess: invalidate,
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, update }: { ids: string[]; update: Record<string, unknown> }) => {
      return apiFetch("/action-queue/bulk", {
        method: "PATCH",
        body: { ids, update },
      });
    },
    onSuccess: invalidate,
  });

  return {
    updateAction,
    completeAction,
    dismissAction,
    snoozeAction,
    bulkUpdate,
    isUpdating:
      updateAction.isPending ||
      completeAction.isPending ||
      dismissAction.isPending ||
      snoozeAction.isPending ||
      bulkUpdate.isPending,
  };
}

export { ACTION_QUEUE_KEYS };
