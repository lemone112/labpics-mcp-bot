"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "labpics:table:";

type SortDirection = "asc" | "desc";
type SortState = { columnId: string; direction: SortDirection } | null;
type FilterState = { columnId: string; value: unknown; operator?: string };
type SelectionMode = "none" | "single" | "multi";
type DataTableColumn = { id: string; defaultVisible?: boolean };

type PersistedPrefs = {
  sort?: SortState;
  filters?: FilterState[];
  page?: number;
  pageSize?: number;
  columnVisibility?: Record<string, boolean>;
} | null;

function loadPreferences(tableId: string): PersistedPrefs {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    return raw ? (JSON.parse(raw) as PersistedPrefs) : null;
  } catch {
    return null;
  }
}

function savePreferences(tableId: string, prefs: PersistedPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

export function useDataTable(config: {
  tableId: string;
  defaultSort?: SortState;
  defaultPageSize?: number;
  totalItems?: number;
  selectionMode?: SelectionMode;
  persistPreferences?: boolean;
  columns?: DataTableColumn[];
}) {
  const {
    tableId,
    defaultSort = null,
    defaultPageSize = 20,
    totalItems = 0,
    selectionMode = "none",
    persistPreferences = false,
    columns = [],
  } = config;

  const persisted = useMemo(
    () => (persistPreferences ? loadPreferences(tableId) : null),
    [tableId, persistPreferences]
  );

  const [sort, setSort] = useState<SortState>(persisted?.sort ?? defaultSort);

  const toggleSort = useCallback((columnId: string) => {
    setSort((prev) => {
      if (prev?.columnId === columnId) {
        if (prev.direction === "asc") return { columnId, direction: "desc" };
        return null;
      }
      return { columnId, direction: "asc" };
    });
  }, []);

  const [filters, setFilters] = useState<FilterState[]>(persisted?.filters ?? []);

  const addFilter = useCallback((filter: FilterState) => {
    setFilters((prev) => {
      const filtered = prev.filter((f) => f.columnId !== filter.columnId);
      return [...filtered, filter];
    });
  }, []);

  const removeFilter = useCallback((columnId: string) => {
    setFilters((prev) => prev.filter((f) => f.columnId !== columnId));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback(
    (id: string) => {
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
    [selectionMode]
  );

  const toggleSelectAll = useCallback(
    (allIds: string[]) => {
      if (selectionMode !== "multi") return;
      setSelectedIds((prev) => {
        const allSelected = allIds.every((id) => prev.has(id));
        if (allSelected) return new Set();
        return new Set(allIds);
      });
    },
    [selectionMode]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const [page, setPage] = useState<number>(persisted?.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(persisted?.pageSize ?? defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(p, totalPages));
      setPage(clamped);
      clearSelection();
    },
    [totalPages, clearSelection]
  );

  const nextPage = useCallback(() => {
    goToPage(page + 1);
  }, [page, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(page - 1);
  }, [page, goToPage]);

  const changePageSize = useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
      clearSelection();
    },
    [clearSelection]
  );

  useEffect(() => {
    setPage(1);
  }, [sort, filters, globalFilter]);

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (persisted?.columnVisibility) return persisted.columnVisibility;
    const initial: Record<string, boolean> = {};
    for (const col of columns) {
      initial[col.id] = col.defaultVisible !== false;
    }
    return initial;
  });

  const toggleColumnVisibility = useCallback((columnId: string) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  }, []);

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

  const visibleColumns = useMemo(
    () => columns.filter((col) => columnVisibility[col.id] !== false),
    [columns, columnVisibility]
  );

  return {
    sort,
    setSort,
    toggleSort,
    filters,
    addFilter,
    removeFilter,
    clearFilters,
    globalFilter,
    setGlobalFilter,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    page,
    pageSize,
    totalItems,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    changePageSize,
    columnVisibility,
    toggleColumnVisibility,
    visibleColumns,
    hasActiveFilters: filters.length > 0 || globalFilter.length > 0,
    isAllSelected: (allIds: string[]) => allIds.length > 0 && allIds.every((id) => selectedIds.has(id)),
  };
}
