"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Query Keys ────────────────────────────────────────────────

const ACTION_QUEUE_KEYS = {
  all: ["action-queue"],
  list: (filters) => ["action-queue", "list", filters],
  counts: () => ["action-queue", "counts"],
  item: (id) => ["action-queue", "item", id],
};

// ── Default Filters ───────────────────────────────────────────

const DEFAULT_FILTERS = {
  status: ["pending", "in_progress"],
  category: [],
  priority: [],
  projectId: null,
  assigneeId: null,
  search: "",
};

const DEFAULT_SORT = {
  field: "priority",
  direction: "desc",
};

// ── Serializer ────────────────────────────────────────────────

function buildQueryParams(filters, sort, page, pageSize) {
  const params = new URLSearchParams();

  if (filters.status?.length) {
    params.set("status", filters.status.join(","));
  }
  if (filters.category?.length) {
    params.set("category", filters.category.join(","));
  }
  if (filters.priority?.length) {
    params.set("priority", filters.priority.join(","));
  }
  if (filters.projectId) {
    params.set("project_id", filters.projectId);
  }
  if (filters.assigneeId) {
    params.set("assignee_id", filters.assigneeId);
  }
  if (filters.search) {
    params.set("q", filters.search);
  }
  if (sort.field) {
    params.set("sort", sort.field);
    params.set("dir", sort.direction || "desc");
  }

  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  return params.toString();
}

// ── useActionQueue — main list hook ───────────────────────────

/**
 * Fetches paginated, filtered, sorted action queue items.
 *
 * @param {{
 *   filters?: import("@/types/action-queue").ActionQueueFilters,
 *   sort?: import("@/types/action-queue").ActionQueueSort,
 *   page?: number,
 *   pageSize?: number,
 *   enabled?: boolean,
 * }} options
 */
export function useActionQueue(options = {}) {
  const {
    filters = DEFAULT_FILTERS,
    sort = DEFAULT_SORT,
    page = 1,
    pageSize = 20,
    enabled = true,
  } = options;

  const stableFilters = useMemo(
    () => ({ ...DEFAULT_FILTERS, ...filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.status?.join(","),
      filters.category?.join(","),
      filters.priority?.join(","),
      filters.projectId,
      filters.assigneeId,
      filters.search,
    ],
  );

  const stableSort = useMemo(
    () => ({ ...DEFAULT_SORT, ...sort }),
    [sort.field, sort.direction],
  );

  const queryKey = ACTION_QUEUE_KEYS.list({ ...stableFilters, ...stableSort, page, pageSize });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const qs = buildQueryParams(stableFilters, stableSort, page, pageSize);
      const data = await apiFetch(`/action-queue?${qs}`);
      return {
        items: Array.isArray(data?.items) ? data.items : [],
        total: data?.total ?? 0,
        page: data?.page ?? page,
        pageSize: data?.pageSize ?? pageSize,
        hasMore: data?.hasMore ?? false,
      };
    },
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  return {
    items: query.data?.items ?? [],
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

// ── useActionQueueCounts — badge counts ───────────────────────

/**
 * Lightweight hook to fetch pending action counts for nav badges.
 * Polling at 30s interval for low-overhead badge updates.
 *
 * @param {{ enabled?: boolean }} options
 */
export function useActionQueueCounts(options = {}) {
  const { enabled = true } = options;

  const query = useQuery({
    queryKey: ACTION_QUEUE_KEYS.counts(),
    queryFn: async () => {
      const data = await apiFetch("/action-queue/counts");
      return {
        total: data?.total ?? 0,
        byCategory: data?.byCategory ?? {},
        byPriority: data?.byPriority ?? {},
        overdue: data?.overdue ?? 0,
      };
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

// ── useActionQueueMutations — update/dismiss/snooze ───────────

/**
 * Provides mutation functions for action queue items.
 * All mutations invalidate both the list and counts queries.
 */
export function useActionQueueMutations() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ACTION_QUEUE_KEYS.all });
  }, [queryClient]);

  const updateAction = useMutation({
    mutationFn: async ({ id, update }) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: update,
      });
    },
    onSuccess: invalidate,
  });

  const completeAction = useMutation({
    mutationFn: async (id) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "completed" },
      });
    },
    onSuccess: invalidate,
  });

  const dismissAction = useMutation({
    mutationFn: async (id) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "dismissed" },
      });
    },
    onSuccess: invalidate,
  });

  const snoozeAction = useMutation({
    mutationFn: async ({ id, snoozedUntil }) => {
      return apiFetch(`/action-queue/${id}`, {
        method: "PATCH",
        body: { status: "snoozed", snoozedUntil },
      });
    },
    onSuccess: invalidate,
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, update }) => {
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
