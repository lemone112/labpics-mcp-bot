// Notification/Alert System — in-app notification design (Iter 20.9).
// Three layers: toast (ephemeral), bell icon (persistent), notification center (full).
//
// Architecture:
// 1. Toast — ephemeral feedback for user actions (already exists in components/ui/toast.jsx)
// 2. Bell Icon — header badge showing unread notification count
// 3. Notification Center — sheet/drawer with full notification list
//
// Toast is fire-and-forget (no persistence).
// Bell + Notification Center items are server-persisted.

// ── Notification Type ──────────────────────────────────────────

export type NotificationType =
  | "info"       // General information
  | "success"    // Positive outcome
  | "warning"    // Needs attention
  | "error"      // Something went wrong
  | "action";    // Requires user action (links to action queue)

// ── Notification Category ──────────────────────────────────────
// Maps to dashboard sections for filtering in notification center.

export type NotificationCategory =
  | "system"      // System-level (deployments, maintenance, errors)
  | "message"     // New message received
  | "agreement"   // Agreement update (approved, expired, etc.)
  | "risk"        // Risk flagged or escalated
  | "finance"     // Financial event (payment, invoice)
  | "offer"       // Offer status change
  | "project"     // Project milestone or status change
  | "signal"      // New signal/NBA generated
  | "digest"      // Digest ready
  | "team";       // Team activity (user joined, role changed)

// ── Notification Item ──────────────────────────────────────────

export interface NotificationItem {
  /** Unique notification ID */
  id: string;

  /** Notification type (determines icon and color) */
  type: NotificationType;

  /** Category for filtering */
  category: NotificationCategory;

  /** Short title (1 line) */
  title: string;

  /** Body text (1-2 lines) */
  body: string | null;

  /** Whether the notification has been read */
  isRead: boolean;

  /** Deep link to relevant entity/page */
  href: string | null;

  /** Related action queue item ID (if type=action) */
  actionId: string | null;

  /** Project context */
  projectId: string | null;
  projectName: string | null;

  /** Who triggered this notification (null = system) */
  actorName: string | null;
  actorAvatarUrl: string | null;

  /** ISO 8601 — when notification was created */
  createdAt: string;

  /** ISO 8601 — when notification was read (null if unread) */
  readAt: string | null;

  /** ISO 8601 — when notification expires (auto-cleanup) */
  expiresAt: string | null;

  /** Grouping key for collapsing similar notifications */
  groupKey: string | null;
}

// ── Notification Group ─────────────────────────────────────────
// For collapsing similar notifications (e.g., "5 new messages in Project X")

export interface NotificationGroup {
  /** Group key */
  groupKey: string;

  /** Latest notification in the group */
  latest: NotificationItem;

  /** Total count of notifications in this group */
  count: number;

  /** Whether any notification in the group is unread */
  hasUnread: boolean;
}

// ── Notification Center State ──────────────────────────────────

export interface NotificationCenterState {
  /** All notifications (paginated) */
  notifications: NotificationItem[];

  /** Grouped notifications */
  groups: NotificationGroup[];

  /** Total unread count */
  unreadCount: number;

  /** Total notification count */
  totalCount: number;

  /** Whether more notifications exist (pagination) */
  hasMore: boolean;

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: string | null;
}

// ── Notification Preferences ───────────────────────────────────

export interface NotificationPreferences {
  /** Categories the user wants to receive */
  enabledCategories: NotificationCategory[];

  /** Whether to show desktop notifications (browser Notification API) */
  desktopEnabled: boolean;

  /** Whether to play sound on new notifications */
  soundEnabled: boolean;

  /** Quiet hours (no desktop notifications) */
  quietHoursStart: string | null; // "22:00"
  quietHoursEnd: string | null;   // "08:00"
}

// ── API ────────────────────────────────────────────────────────

export interface NotificationListResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  totalCount: number;
  hasMore: boolean;
}

export interface NotificationCountResponse {
  unreadCount: number;
}

export interface NotificationMarkReadPayload {
  ids: string[];
}

export interface NotificationMarkAllReadPayload {
  beforeDate?: string; // ISO 8601 — mark all before this date
}
