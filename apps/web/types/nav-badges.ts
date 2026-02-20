// Navigation Badge System — types for badge indicators on nav items.
// Shows pending item counts on sidebar/nav-rail items (Iter 20.4).

// ── Badge Variant ──────────────────────────────────────────────

export type NavBadgeVariant =
  | "count"     // Shows a number (e.g., "3")
  | "dot"       // Shows a colored dot (presence indicator)
  | "new";      // Shows "NEW" text badge

// ── Badge Severity ─────────────────────────────────────────────
// Controls color/urgency of the badge.

export type NavBadgeSeverity =
  | "default"    // Primary color — standard pending items
  | "warning"    // Warning color — needs attention soon
  | "critical"   // Destructive color — overdue or urgent
  | "info";      // Muted color — informational only

// ── Badge Config ───────────────────────────────────────────────

export interface NavBadgeConfig {
  /** Nav item key (matches PORTFOLIO_SECTIONS or NAV_ITEMS keys) */
  key: string;

  /** Badge variant */
  variant: NavBadgeVariant;

  /** Badge severity */
  severity: NavBadgeSeverity;

  /** Count to display (for variant="count") */
  count: number;

  /** Accessible label for screen readers */
  ariaLabel: string;

  /** Whether to pulse/animate the badge (for critical items) */
  pulse: boolean;
}

// ── Badge Map ──────────────────────────────────────────────────
// Mapping from nav item keys to their badge configs.

export type NavBadgeMap = Record<string, NavBadgeConfig | null>;

// ── Badge Provider State ───────────────────────────────────────

export interface NavBadgeState {
  badges: NavBadgeMap;
  totalPending: number;
  isLoading: boolean;
}
