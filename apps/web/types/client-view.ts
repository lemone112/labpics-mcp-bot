// Client-Centric View — data model for aggregated client information.
// Shows all info about a specific client across all projects (Iter 20.5).

// ── Client Profile ─────────────────────────────────────────────

export interface ClientProfile {
  /** Unique client ID */
  id: string;

  /** Client display name (company or individual) */
  name: string;

  /** Client email (primary contact) */
  email: string | null;

  /** Client phone number */
  phone: string | null;

  /** Company name (if applicable) */
  company: string | null;

  /** Avatar URL */
  avatarUrl: string | null;

  /** Tags/labels for categorization */
  tags: string[];

  /** ISO 8601 — when client was first seen */
  firstContactAt: string;

  /** ISO 8601 — last interaction across any project */
  lastInteractionAt: string | null;

  /** External CRM reference ID (e.g., Attio ID) */
  externalCrmId: string | null;

  /** Custom fields from CRM */
  customFields: Record<string, unknown>;
}

// ── Client Project Summary ─────────────────────────────────────

export interface ClientProjectSummary {
  /** Project ID */
  projectId: string;

  /** Project name */
  projectName: string;

  /** Project status */
  projectStatus: string;

  /** Total messages in this project for this client */
  messageCount: number;

  /** Open tasks/jobs related to this client */
  openJobCount: number;

  /** Active agreements count */
  activeAgreementCount: number;

  /** Active risks count */
  activeRiskCount: number;

  /** Total revenue from this client in this project */
  revenue: number | null;

  /** Currency code */
  currency: string | null;

  /** ISO 8601 — last activity in this project */
  lastActivityAt: string | null;
}

// ── Client Message ─────────────────────────────────────────────

export interface ClientMessage {
  /** Message ID */
  id: string;

  /** Project ID this message belongs to */
  projectId: string;

  /** Project name for display */
  projectName: string;

  /** Message content (may be truncated) */
  content: string;

  /** Message direction */
  direction: "inbound" | "outbound";

  /** ISO 8601 timestamp */
  sentAt: string;

  /** Channel (email, chat, phone, etc.) */
  channel: string;

  /** Whether message has been read */
  isRead: boolean;
}

// ── Client Agreement ───────────────────────────────────────────

export interface ClientAgreement {
  /** Agreement ID */
  id: string;

  /** Project ID */
  projectId: string;

  /** Project name for display */
  projectName: string;

  /** Agreement title */
  title: string;

  /** Status (pending, approved, expired, etc.) */
  status: string;

  /** ISO 8601 — due/expiry date */
  dueAt: string | null;

  /** Value amount if applicable */
  value: number | null;

  /** Currency */
  currency: string | null;
}

// ── Client Risk ────────────────────────────────────────────────

export interface ClientRisk {
  /** Risk ID */
  id: string;

  /** Project ID */
  projectId: string;

  /** Project name */
  projectName: string;

  /** Risk title */
  title: string;

  /** Severity level */
  severity: "low" | "medium" | "high" | "critical";

  /** Status */
  status: string;

  /** ISO 8601 — when risk was flagged */
  flaggedAt: string;
}

// ── Client Timeline Event ──────────────────────────────────────

export interface ClientTimelineEvent {
  /** Event ID */
  id: string;

  /** Event type */
  type: "message" | "agreement" | "risk" | "job" | "offer" | "note" | "status_change";

  /** Short description */
  title: string;

  /** Longer description (optional) */
  description: string | null;

  /** Project ID */
  projectId: string;

  /** Project name for display */
  projectName: string;

  /** ISO 8601 timestamp */
  occurredAt: string;

  /** Deep link to the entity */
  href: string | null;

  /** Metadata for the event */
  metadata: Record<string, unknown> | null;
}

// ── Aggregated Client View ─────────────────────────────────────

export interface ClientViewData {
  /** Client profile */
  profile: ClientProfile;

  /** Summary across all projects */
  projectSummaries: ClientProjectSummary[];

  /** Aggregate stats */
  stats: ClientViewStats;

  /** Recent timeline events (last 50) */
  recentTimeline: ClientTimelineEvent[];

  /** Pending action queue items for this client */
  pendingActions: number;
}

export interface ClientViewStats {
  /** Total projects this client is involved in */
  totalProjects: number;

  /** Total messages across all projects */
  totalMessages: number;

  /** Total open jobs across all projects */
  totalOpenJobs: number;

  /** Total active agreements */
  totalActiveAgreements: number;

  /** Total active risks */
  totalActiveRisks: number;

  /** Total revenue (all currencies converted to primary) */
  totalRevenue: number | null;

  /** Primary currency */
  primaryCurrency: string | null;

  /** Average response time in hours */
  avgResponseTimeHours: number | null;

  /** Client health score (0-100) */
  healthScore: number | null;
}

// ── API ────────────────────────────────────────────────────────

export interface ClientViewResponse {
  client: ClientViewData;
}

export interface ClientListFilters {
  search?: string;
  tags?: string[];
  projectId?: string | null;
  hasActiveRisks?: boolean;
  sortBy?: "name" | "lastInteractionAt" | "healthScore" | "totalRevenue";
  sortDirection?: "asc" | "desc";
}

export interface ClientListResponse {
  clients: ClientProfile[];
  total: number;
  page: number;
  pageSize: number;
}
