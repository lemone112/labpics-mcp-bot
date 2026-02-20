"use client";

import { useCallback } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FilterX,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// ── Sort Header ────────────────────────────────────────────────

function SortableHeader({ column, sort, onToggleSort }) {
  const isActive = sort?.columnId === column.id;
  const direction = isActive ? sort.direction : null;

  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => onToggleSort(column.id)}
      aria-label={`Сортировать по ${column.header}`}
    >
      <span>{column.header}</span>
      <Icon className={cn("size-3.5", isActive ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );
}

// ── Bulk Action Bar ────────────────────────────────────────────

function BulkActionBar({ selectedCount, bulkActions, onBulkAction, onClearSelection }) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-accent/30 px-3 py-2">
      <span className="text-sm font-medium">
        Выбрано: {selectedCount}
      </span>
      <div className="flex items-center gap-1">
        {bulkActions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant === "destructive" ? "destructive" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onBulkAction(action)}
            disabled={selectedCount < (action.minSelection || 1)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 text-xs"
        onClick={onClearSelection}
      >
        Снять выделение
      </Button>
    </div>
  );
}

// ── Table Toolbar ──────────────────────────────────────────────

function DataTableToolbar({
  globalFilter,
  onGlobalFilterChange,
  showGlobalFilter,
  hasActiveFilters,
  onClearFilters,
  showColumnToggle,
  columns,
  columnVisibility,
  onToggleColumnVisibility,
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        {showGlobalFilter ? (
          <Input
            value={globalFilter}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            placeholder="Поиск..."
            aria-label="Поиск по таблице"
            className="h-8 md:max-w-xs"
          />
        ) : null}

        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onClearFilters}
          >
            <FilterX className="size-3.5" />
            Сбросить
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {showColumnToggle ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Columns3 className="size-3.5" />
                Столбцы
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns
                .filter((col) => col.hideable !== false)
                .map((col) => (
                  <DropdownMenuItem
                    key={col.id}
                    onClick={() => onToggleColumnVisibility(col.id)}
                  >
                    <Checkbox
                      checked={columnVisibility[col.id] !== false}
                      className="mr-2"
                    />
                    {col.header}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

// ── Table Pagination ───────────────────────────────────────────

function DataTablePagination({
  page,
  pageSize,
  totalPages,
  totalItems,
  pageSizeOptions = [10, 20, 50],
  onPageChange,
  onPageSizeChange,
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
      <span className="text-xs text-muted-foreground">
        Всего: {totalItems}
      </span>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Строк:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-3.5" />
            <span className="sr-only">Предыдущая страница</span>
          </Button>

          <span className="min-w-[60px] text-center text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="size-3.5" />
            <span className="sr-only">Следующая страница</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Row Actions Menu ───────────────────────────────────────────

function RowActionsMenu({ row, rowActions, onRowAction }) {
  const visibleActions = rowActions.filter(
    (action) => !action.isVisible || action.isVisible(row),
  );

  if (!visibleActions.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Действия"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibleActions.map((action, i) => (
          <span key={action.id}>
            {i > 0 && action.variant === "destructive" ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              onClick={() => onRowAction(action, row)}
              className={action.variant === "destructive" ? "text-destructive" : undefined}
              disabled={action.isEnabled ? !action.isEnabled(row) : false}
            >
              {action.label}
            </DropdownMenuItem>
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function DataTableSkeleton({ columns = 4, rows = 5 }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-3 w-20 rounded-sm" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <TableRow key={rowIdx}>
            {Array.from({ length: columns }).map((_, colIdx) => (
              <TableCell key={colIdx}>
                <Skeleton className="h-3 w-24 rounded-sm" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main DataTable Component ───────────────────────────────────

/**
 * DataTable — standardized table with sorting, filtering, selection,
 * row actions, bulk actions, and pagination.
 *
 * Composes with shadcn Table primitives. Use useDataTable() hook
 * for state management.
 *
 * @param {{
 *   data: Record<string, unknown>[],
 *   columns: import("@/types/data-table").DataTableColumn[],
 *   tableState: ReturnType<import("@/hooks/use-data-table").useDataTable>,
 *   loading?: boolean,
 *   renderCell?: (column: import("@/types/data-table").DataTableColumn, row: Record<string, unknown>) => React.ReactNode,
 *   rowActions?: import("@/types/data-table").RowAction[],
 *   bulkActions?: import("@/types/data-table").BulkAction[],
 *   onRowAction?: (action: import("@/types/data-table").RowAction, row: Record<string, unknown>) => void,
 *   onBulkAction?: (action: import("@/types/data-table").BulkAction) => void,
 *   onRowClick?: (row: Record<string, unknown>) => void,
 *   getRowId?: (row: Record<string, unknown>) => string,
 *   showGlobalFilter?: boolean,
 *   showColumnToggle?: boolean,
 *   pageSizeOptions?: number[],
 *   emptyState?: { title: string, description: string },
 *   className?: string,
 * }} props
 */
export function DataTable({
  data,
  columns,
  tableState,
  loading = false,
  renderCell,
  rowActions = [],
  bulkActions = [],
  onRowAction,
  onBulkAction,
  onRowClick,
  getRowId = (row) => String(row.id),
  showGlobalFilter = true,
  showColumnToggle = true,
  pageSizeOptions = [10, 20, 50],
  emptyState,
  className,
}) {
  const allRowIds = data.map(getRowId);
  const hasRowActions = rowActions.length > 0;
  const hasSelection = tableState.selectedCount !== undefined && bulkActions.length > 0;

  // Default cell renderer
  const defaultRenderCell = useCallback(
    (column, row) => {
      if (renderCell) {
        const custom = renderCell(column, row);
        if (custom !== undefined) return custom;
      }

      const value = column.accessorKey.split(".").reduce((obj, key) => obj?.[key], row);

      if (value == null) return <span className="text-muted-foreground">-</span>;
      return <span>{String(value)}</span>;
    },
    [renderCell],
  );

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <DataTableSkeleton columns={columns.length} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <DataTableToolbar
        globalFilter={tableState.globalFilter}
        onGlobalFilterChange={tableState.setGlobalFilter}
        showGlobalFilter={showGlobalFilter}
        hasActiveFilters={tableState.hasActiveFilters}
        onClearFilters={tableState.clearFilters}
        showColumnToggle={showColumnToggle}
        columns={columns}
        columnVisibility={tableState.columnVisibility}
        onToggleColumnVisibility={tableState.toggleColumnVisibility}
      />

      {/* Bulk action bar */}
      {hasSelection ? (
        <BulkActionBar
          selectedCount={tableState.selectedCount}
          bulkActions={bulkActions}
          onBulkAction={onBulkAction}
          onClearSelection={tableState.clearSelection}
        />
      ) : null}

      {/* Table */}
      {data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              {hasSelection ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={tableState.isAllSelected(allRowIds)}
                    onCheckedChange={() => tableState.toggleSelectAll(allRowIds)}
                    aria-label="Выбрать все"
                  />
                </TableHead>
              ) : null}

              {tableState.visibleColumns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  {column.sortable ? (
                    <SortableHeader
                      column={column}
                      sort={tableState.sort}
                      onToggleSort={tableState.toggleSort}
                    />
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}

              {hasRowActions ? (
                <TableHead className="w-10">
                  <span className="sr-only">Действия</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((row) => {
              const rowId = getRowId(row);
              const isSelected = tableState.selectedIds?.has(rowId);

              return (
                <TableRow
                  key={rowId}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {hasSelection ? (
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => tableState.toggleSelection(rowId)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Выбрать строку ${rowId}`}
                      />
                    </TableCell>
                  ) : null}

                  {tableState.visibleColumns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        column.align === "right" && "text-right",
                        column.align === "center" && "text-center",
                      )}
                    >
                      {defaultRenderCell(column, row)}
                    </TableCell>
                  ))}

                  {hasRowActions ? (
                    <TableCell>
                      <RowActionsMenu
                        row={row}
                        rowActions={rowActions}
                        onRowAction={onRowAction}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          title={emptyState?.title || "Нет данных"}
          description={emptyState?.description || "Данные появятся после загрузки."}
        />
      )}

      {/* Pagination */}
      {tableState.totalItems > 0 ? (
        <DataTablePagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          totalPages={tableState.totalPages}
          totalItems={tableState.totalItems}
          pageSizeOptions={pageSizeOptions}
          onPageChange={tableState.goToPage}
          onPageSizeChange={tableState.changePageSize}
        />
      ) : null}
    </div>
  );
}

export { DataTableSkeleton };
