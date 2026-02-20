// Action Queue — data model for pending user actions.
// Used across dashboard, notification center, and nav badges.
// This is the foundation for UX-driven workflows (Iter 20).

// ── Priority ───────────────────────────────────────────────────

export type ActionPriority = "critical" | "high" | "medium" | "low";

// ── Status ─────────────────────────────────────────────────────

export type ActionStatus =
  | "pending"    // Not started, awaiting user action
  | "in_progress" // User has started but not completed
  | "snoozed"   // Temporarily deferred by user
  | "completed" // Finished successfully
  | "dismissed" // User chose to skip
  | "expired";  // Auto-expired past deadline

// ── Category ───────────────────────────────────────────────────
// Categories map to sections/features in the dashboard.

export type ActionCategory =
  | "agreement"    // Client agreement needs attention (review, sign, followup)
  | "message"      // Message requires response or decision
  | "risk"         // Risk flagged — needs assessment or mitigation
  | "finance"      // Financial item needs action (invoice, payment, approval)
  | "offer"        // Offer/upsell opportunity to act on
  | "project"      // Project-level action (milestone, status update)
  | "onboarding"   // Setup/onboarding step for a new project or feature
  | "system";      // System-level action (update, migration, config)

// ── Source ─────────────────────────────────────────────────────
// Where the action was generated from.

export type ActionSource =
  | "auto"     // System-generated (signal, digest, rule engine)
  | "manual"   // Created manually by user
  | "signal"   // Generated from signal/NBA engine
  | "digest";  // Generated from digest processing

// ── Action Item ────────────────────────────────────────────────

export interface ActionQueueItem {
  /** Unique action ID (UUID) */
  id: string;

  /** Human-readable title (short, imperative) */
  title: string;

  /** Optional longer description with context */
  description: string | null;

  /** Action category — determines icon, color, and routing */
  category: ActionCategory;

  /** Priority level — determines sort order and visual weight */
  priority: ActionPriority;

  /** Current status */
  status: ActionStatus;

  /** Where this action was generated from */
  source: ActionSource;

  /** Project ID this action belongs to (null = cross-project) */
  projectId: string | null;

  /** Project name for display (denormalized) */
  projectName: string | null;

  /** Client ID if action is client-related */
  clientId: string | null;

  /** Client name for display (denormalized) */
  clientName: string | null;

  /** ID of the user this action is assigned to */
  assigneeId: string | null;

  /** Display name of the assignee */
  assigneeName: string | null;

  /** Deep link to the relevant section/entity */
  href: string | null;

  /** CTA label for the primary action button */
  actionLabel: string;

  /** ISO 8601 timestamp — when the action was created */
  createdAt: string;

  /** ISO 8601 timestamp — when the action was last updated */
  updatedAt: string;

  /** ISO 8601 timestamp — deadline, if any */
  dueAt: string | null;

  /** ISO 8601 timestamp — when snoozed until (if status=snoozed) */
  snoozedUntil: string | null;

  /** Arbitrary metadata from the source system */
  metadata: Record<string, unknown> | null;
}

// ── Filters ────────────────────────────────────────────────────

export interface ActionQueueFilters {
  status?: ActionStatus[];
  category?: ActionCategory[];
  priority?: ActionPriority[];
  projectId?: string | null;
  assigneeId?: string | null;
  search?: string;
}

// ── Sort ───────────────────────────────────────────────────────

export type ActionQueueSortField = "priority" | "dueAt" | "createdAt" | "updatedAt";
export type ActionQueueSortDirection = "asc" | "desc";

export interface ActionQueueSort {
  field: ActionQueueSortField;
  direction: ActionQueueSortDirection;
}

// ── API Response ───────────────────────────────────────────────

export interface ActionQueueResponse {
  items: ActionQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Counts (for nav badges) ────────────────────────────────────

export interface ActionQueueCounts {
  total: number;
  byCategory: Record<ActionCategory, number>;
  byPriority: Record<ActionPriority, number>;
  overdue: number;
}

// ── Mutations ──────────────────────────────────────────────────

export interface ActionQueueUpdatePayload {
  status?: ActionStatus;
  snoozedUntil?: string | null;
  assigneeId?: string | null;
  priority?: ActionPriority;
}

export interface ActionQueueBulkUpdatePayload {
  ids: string[];
  update: ActionQueueUpdatePayload;
}
