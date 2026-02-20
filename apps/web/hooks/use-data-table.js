"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "labpics:table:";

/**
 * Reads persisted table preferences from localStorage.
 */
function loadPreferences(tableId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Saves table preferences to localStorage.
 */
function savePreferences(tableId, prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

/**
 * useDataTable — manages standardized table state.
 *
 * Provides sorting, filtering, selection, pagination, and column visibility
 * with optional localStorage persistence.
 *
 * @param {{
 *   tableId: string,
 *   defaultSort?: import("@/types/data-table").SortState | null,
 *   defaultPageSize?: number,
 *   totalItems?: number,
 *   selectionMode?: import("@/types/data-table").SelectionMode,
 *   persistPreferences?: boolean,
 *   columns?: import("@/types/data-table").DataTableColumn[],
 * }} config
 */
export function useDataTable(config) {
  const {
    tableId,
    defaultSort = null,
    defaultPageSize = 20,
    totalItems = 0,
    selectionMode = "none",
    persistPreferences = false,
    columns = [],
  } = config;

  // Load persisted preferences
  const persisted = useMemo(
    () => (persistPreferences ? loadPreferences(tableId) : null),
    [tableId, persistPreferences],
  );

  // ── Sort ────────────────────────────────────────────────────
  const [sort, setSort] = useState(
    persisted?.sort ?? defaultSort,
  );

  const toggleSort = useCallback(
    (columnId) => {
      setSort((prev) => {
        if (prev?.columnId === columnId) {
          // Toggle direction, then remove
          if (prev.direction === "asc") return { columnId, direction: "desc" };
          return null; // Remove sort
        }
        return { columnId, direction: "asc" };
      });
    },
    [],
  );

  // ── Filters ─────────────────────────────────────────────────
  const [filters, setFilters] = useState(
    persisted?.filters ?? [],
  );

  const addFilter = useCallback((filter) => {
    setFilters((prev) => {
      // Replace existing filter for same column
      const filtered = prev.filter((f) => f.columnId !== filter.columnId);
      return [...filtered, filter];
    });
  }, []);

  const removeFilter = useCallback((columnId) => {
    setFilters((prev) => prev.filter((f) => f.columnId !== columnId));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  // ── Global Filter ───────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("");

  // ── Selection ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelection = useCallback(
    (id) => {
      if (selectionMode === "none") return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selectionMode === "single") {
          if (next.has(id)) {
            next.clear();
          } else {
            next.clear();
            next.add(id);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    },
    [selectionMode],
  );

  const toggleSelectAll = useCallback(
    (allIds) => {
      if (selectionMode !== "multi") return;
      setSelectedIds((prev) => {
        const allSelected = allIds.every((id) => prev.has(id));
        if (allSelected) return new Set();
        return new Set(allIds);
      });
    },
    [selectionMode],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Pagination ──────────────────────────────────────────────
  const [page, setPage] = useState(persisted?.page ?? 1);
  const [pageSize, setPageSize] = useState(
    persisted?.pageSize ?? defaultPageSize,
  );

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const goToPage = useCallback(
    (p) => {
      const clamped = Math.max(1, Math.min(p, totalPages));
      setPage(clamped);
      clearSelection();
    },
    [totalPages, clearSelection],
  );

  const nextPage = useCallback(() => {
    goToPage(page + 1);
  }, [page, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(page - 1);
  }, [page, goToPage]);

  const changePageSize = useCallback(
    (size) => {
      setPageSize(size);
      setPage(1);
      clearSelection();
    },
    [clearSelection],
  );

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setPage(1);
  }, [sort, filters, globalFilter]);

  // ── Column Visibility ───────────────────────────────────────
  const [columnVisibility, setColumnVisibility] = useState(() => {
    if (persisted?.columnVisibility) return persisted.columnVisibility;
    const initial = {};
    for (const col of columns) {
      initial[col.id] = col.defaultVisible !== false;
    }
    return initial;
  });

  const toggleColumnVisibility = useCallback((columnId) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  }, []);

  // ── Persist Preferences ─────────────────────────────────────
  useEffect(() => {
    if (!persistPreferences) return;
    savePreferences(tableId, {
      sort,
      filters,
      page,
      pageSize,
      columnVisibility,
    });
  }, [persistPreferences, tableId, sort, filters, page, pageSize, columnVisibility]);

  // ── Visible Columns ─────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter((col) => columnVisibility[col.id] !== false),
    [columns, columnVisibility],
  );

  return {
    // Sort
    sort,
    setSort,
    toggleSort,

    // Filters
    filters,
    addFilter,
    removeFilter,
    clearFilters,
    globalFilter,
    setGlobalFilter,

    // Selection
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    toggleSelectAll,
    clearSelection,

    // Pagination
    page,
    pageSize,
    totalItems,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    changePageSize,

    // Column visibility
    columnVisibility,
    toggleColumnVisibility,
    visibleColumns,

    // Helpers
    hasActiveFilters: filters.length > 0 || globalFilter.length > 0,
    isAllSelected: (allIds) => allIds.length > 0 && allIds.every((id) => selectedIds.has(id)),
  };
}
