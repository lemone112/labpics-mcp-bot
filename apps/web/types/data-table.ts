// Data Table Interaction Patterns — standardized table behaviors (Iter 20.10).
// Defines sorting, filtering, row actions, bulk actions, and pagination.
// These types compose with the existing shadcn Table primitives.

// ── Column Definition ──────────────────────────────────────────

export interface DataTableColumn<TRow = Record<string, unknown>> {
  /** Unique column identifier */
  id: string;

  /** Display header text */
  header: string;

  /** Data accessor key (dot notation for nested) */
  accessorKey: string;

  /** Whether this column is sortable */
  sortable: boolean;

  /** Whether this column is filterable */
  filterable: boolean;

  /** Column width behavior */
  width: "auto" | "fit" | "fixed";

  /** Fixed width in px (when width="fixed") */
  fixedWidth: number | null;

  /** Whether to show on mobile */
  visibleOnMobile: boolean;

  /** Cell alignment */
  align: "left" | "center" | "right";

  /** Cell renderer type (determines how value is displayed) */
  cellType: "text" | "number" | "date" | "status" | "badge" | "avatar" | "actions" | "custom";

  /** Whether this column can be hidden by user */
  hideable: boolean;

  /** Default visibility */
  defaultVisible: boolean;

  /** Sort priority (for multi-column sort, lower = primary) */
  sortPriority: number | null;
}

// ── Sorting ────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export interface SortState {
  /** Column ID to sort by */
  columnId: string;
  /** Sort direction */
  direction: SortDirection;
}

// ── Filtering ──────────────────────────────────────────────────

export type FilterOperator =
  | "eq"       // Equals
  | "neq"      // Not equals
  | "contains" // Contains substring
  | "gt"       // Greater than
  | "gte"      // Greater than or equal
  | "lt"       // Less than
  | "lte"      // Less than or equal
  | "in"       // In list
  | "between"  // Between two values
  | "empty"    // Is null/empty
  | "notEmpty"; // Is not null/empty

export interface FilterState {
  /** Column ID to filter */
  columnId: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value(s) */
  value: string | string[] | number | [number, number] | null;
}

// ── Selection ──────────────────────────────────────────────────

export type SelectionMode = "none" | "single" | "multi";

export interface SelectionState {
  /** Set of selected row IDs */
  selectedIds: Set<string>;
  /** Whether all visible rows are selected */
  allSelected: boolean;
}

// ── Row Actions ────────────────────────────────────────────────

export interface RowAction<TRow = Record<string, unknown>> {
  /** Action identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name */
  icon: string | null;
  /** Action variant (determines color) */
  variant: "default" | "destructive";
  /** Whether to show confirmation dialog before executing */
  requireConfirmation: boolean;
  /** Confirmation dialog message */
  confirmationMessage: string | null;
  /** Whether this action is available for a given row */
  isEnabled?: (row: TRow) => boolean;
  /** Whether this action is visible for a given row */
  isVisible?: (row: TRow) => boolean;
}

// ── Bulk Actions ───────────────────────────────────────────────

export interface BulkAction {
  /** Action identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name */
  icon: string | null;
  /** Action variant */
  variant: "default" | "destructive";
  /** Whether to show confirmation dialog */
  requireConfirmation: boolean;
  /** Confirmation message (supports {count} placeholder) */
  confirmationMessage: string | null;
  /** Minimum selected items for this action to be enabled */
  minSelection: number;
}

// ── Pagination ─────────────────────────────────────────────────

export interface PaginationState {
  /** Current page (1-based) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total items across all pages */
  totalItems: number;
  /** Total pages */
  totalPages: number;
  /** Available page sizes */
  pageSizeOptions: number[];
}

// ── Table State (aggregated) ───────────────────────────────────

export interface DataTableState {
  /** Current sort */
  sort: SortState | null;
  /** Active filters */
  filters: FilterState[];
  /** Row selection */
  selection: SelectionState;
  /** Pagination */
  pagination: PaginationState;
  /** Column visibility overrides */
  columnVisibility: Record<string, boolean>;
  /** Global search query (text filter across all columns) */
  globalFilter: string;
}

// ── Table Config ───────────────────────────────────────────────
// Configuration object that defines a table's capabilities.

export interface DataTableConfig<TRow = Record<string, unknown>> {
  /** Table identifier (for persisting user preferences) */
  tableId: string;
  /** Column definitions */
  columns: DataTableColumn<TRow>[];
  /** Selection mode */
  selectionMode: SelectionMode;
  /** Row actions (shown in dropdown per row) */
  rowActions: RowAction<TRow>[];
  /** Bulk actions (shown when rows are selected) */
  bulkActions: BulkAction[];
  /** Default sort */
  defaultSort: SortState | null;
  /** Default page size */
  defaultPageSize: number;
  /** Whether to show the global filter input */
  showGlobalFilter: boolean;
  /** Whether to show column visibility toggle */
  showColumnToggle: boolean;
  /** Whether to show export button */
  showExport: boolean;
  /** Whether to persist user preferences (sort, filters, column visibility) */
  persistPreferences: boolean;
  /** Row click behavior */
  onRowClick: "none" | "select" | "navigate" | "expand";
  /** Empty state configuration */
  emptyState: {
    title: string;
    description: string;
    actionLabel: string | null;
    actionHref: string | null;
  };
}
