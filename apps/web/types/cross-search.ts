// Cross-Section Search — global search across all sections (Iter 20.8).
// Foundation for Iter 45 (Search UX) which builds the full experience.

// ── Search Result Type ─────────────────────────────────────────

export type SearchResultType =
  | "client"
  | "project"
  | "message"
  | "job"
  | "agreement"
  | "risk"
  | "offer"
  | "signal"
  | "digest";

// ── Search Result ──────────────────────────────────────────────

export interface SearchResult {
  /** Unique result ID */
  id: string;

  /** Result type (determines icon, routing, and grouping) */
  type: SearchResultType;

  /** Primary display title */
  title: string;

  /** Secondary text (excerpt with highlight) */
  excerpt: string | null;

  /** Relevance score (0-1, higher = more relevant) */
  score: number;

  /** Deep link to the entity */
  href: string;

  /** Project context */
  projectId: string | null;
  projectName: string | null;

  /** Client context */
  clientId: string | null;
  clientName: string | null;

  /** Status if applicable */
  status: string | null;

  /** ISO 8601 — when the entity was last updated */
  updatedAt: string;

  /** Highlighted matches (character ranges in title and excerpt) */
  highlights: SearchHighlight[];

  /** Metadata specific to result type */
  metadata: Record<string, unknown> | null;
}

export interface SearchHighlight {
  /** Which field the highlight applies to ("title" | "excerpt") */
  field: "title" | "excerpt";
  /** Start character index */
  start: number;
  /** End character index */
  end: number;
}

// ── Search Response ────────────────────────────────────────────

export interface SearchResponse {
  /** Grouped results by type */
  results: SearchResult[];

  /** Total count per type */
  countsByType: Record<SearchResultType, number>;

  /** Total results across all types */
  totalCount: number;

  /** Query that was searched */
  query: string;

  /** Time taken in ms */
  durationMs: number;

  /** Whether more results exist */
  hasMore: boolean;

  /** Suggested queries (for empty/sparse results) */
  suggestions: string[];
}

// ── Search Filters ─────────────────────────────────────────────

export interface SearchFilters {
  /** Filter by result types */
  types?: SearchResultType[];

  /** Filter by project */
  projectId?: string | null;

  /** Filter by date range */
  dateFrom?: string | null;
  dateTo?: string | null;

  /** Filter by status */
  status?: string[];
}

// ── Search State ───────────────────────────────────────────────

export interface SearchState {
  /** Current query string */
  query: string;

  /** Active filters */
  filters: SearchFilters;

  /** Whether search is in progress */
  isSearching: boolean;

  /** Current results */
  results: SearchResult[];

  /** Total result count */
  totalCount: number;

  /** Counts by type for faceted navigation */
  countsByType: Record<SearchResultType, number>;

  /** Suggestions */
  suggestions: string[];

  /** Recent searches (stored locally) */
  recentSearches: string[];

  /** Error state */
  error: string | null;
}

// ── Search Result Type Config (for UI rendering) ───────────────

export interface SearchResultTypeConfig {
  /** Type key */
  type: SearchResultType;

  /** Display label */
  label: string;

  /** Lucide icon name */
  icon: string;

  /** Base URL for deep links */
  baseHref: string;
}
