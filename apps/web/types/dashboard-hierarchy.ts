// Dashboard Hierarchy — information architecture for the main dashboard.
// Defines what shows first, what's secondary, what's in detail views (Iter 20.7).
//
// Design principle: "Action-first" — the most urgent items surface at the top,
// followed by context, then deep-dive analytics.

// ── Dashboard Zone ─────────────────────────────────────────────
// Zones define the visual hierarchy of the dashboard layout.
// Each zone has a priority, component type, and data source.

export type DashboardZone =
  | "hero"        // Top zone: critical actions + key metrics
  | "actions"     // Action queue: pending items requiring user attention
  | "insights"    // Insights row: AI-generated observations
  | "overview"    // Overview: project/portfolio summary cards
  | "activity"    // Activity feed: recent timeline events
  | "detail";     // Detail zone: tables, charts, deep-dive content

// ── Zone Priority ──────────────────────────────────────────────

export type ZonePriority = 1 | 2 | 3 | 4 | 5;

// ── Dashboard Section ──────────────────────────────────────────
// Each section is a renderable block within a zone.

export interface DashboardSection {
  /** Unique section identifier */
  id: string;

  /** Which zone this section belongs to */
  zone: DashboardZone;

  /** Priority within the zone (lower = shown first) */
  priority: ZonePriority;

  /** Section title */
  title: string;

  /** Component name to render (maps to a React component) */
  component: string;

  /** Whether this section is collapsible */
  collapsible: boolean;

  /** Whether this section is collapsed by default */
  defaultCollapsed: boolean;

  /** Whether this section is visible by default */
  visible: boolean;

  /** Minimum user role to see this section */
  minRole: "pm" | "owner";

  /** Data dependencies (API endpoints needed) */
  dataSources: string[];

  /** Grid span on desktop (1-4 columns in a 4-col grid) */
  gridSpan: 1 | 2 | 3 | 4;

  /** Whether to show a "View all" link */
  showViewAll: boolean;

  /** Deep link for "View all" */
  viewAllHref: string | null;
}

// ── Dashboard Layout Config ────────────────────────────────────

export interface DashboardLayoutConfig {
  /** Ordered list of sections defining the full dashboard */
  sections: DashboardSection[];

  /** User preferences for hidden/reordered sections */
  userOverrides: DashboardUserOverrides | null;
}

export interface DashboardUserOverrides {
  /** Sections the user has hidden */
  hiddenSections: string[];

  /** Sections the user has collapsed */
  collapsedSections: string[];

  /** Custom section order (section IDs in display order) */
  sectionOrder: string[] | null;
}

// ── Default Dashboard Hierarchy ────────────────────────────────
// This is the canonical layout order used by Iter 21 (Page Redesign).
// Sections within each zone are sorted by priority.
//
// ZONE 1: Hero (critical metrics + setup wizard if incomplete)
//   1.1  Setup Wizard (only if project setup is incomplete)
//   1.2  Key StatTiles (4 cards: active projects, open tasks, pending messages, overdue items)
//
// ZONE 2: Actions (things requiring user action NOW)
//   2.1  Action Queue (top 5 pending actions, sorted by priority)
//   2.2  Overdue items banner (if any)
//
// ZONE 3: Insights (AI-generated observations)
//   3.1  Insight tiles (3-4 cards, auto-rotated or scrollable)
//
// ZONE 4: Overview (portfolio/project status)
//   4.1  Projects overview table (compact, with status chips)
//   4.2  Financial summary (revenue, pending invoices)
//   4.3  Risk summary (active risks by severity)
//
// ZONE 5: Activity (recent events)
//   5.1  Activity timeline (last 10 events)
//   5.2  Recent messages preview
//
// ZONE 6: Detail (deep-dive, usually below the fold)
//   6.1  Charts (revenue trend, message volume, task velocity)
//   6.2  Agreements table (upcoming expirations)
//   6.3  Offers pipeline (kanban or table)
