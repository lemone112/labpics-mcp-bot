// Insight Tile — reusable card component for showing key insights/metrics.
// More advanced than StatTile — supports insight context, sparklines, and actions (Iter 20.6).
// StatTile remains the right choice for simple numeric KPIs.
// InsightTile is for narrative insights that combine data + context + action.

// ── Insight Type ───────────────────────────────────────────────

export type InsightType =
  | "metric"     // Numeric insight with trend (enhanced StatTile)
  | "alert"      // Warning/notification insight
  | "suggestion" // Actionable recommendation
  | "summary"    // Narrative summary of activity
  | "milestone"; // Achievement or milestone reached

// ── Insight Severity ───────────────────────────────────────────

export type InsightSeverity =
  | "positive"   // Good news (green accent)
  | "negative"   // Bad news (red accent)
  | "neutral"    // Informational (default)
  | "warning";   // Needs attention (amber accent)

// ── Sparkline Data Point ───────────────────────────────────────

export interface SparklinePoint {
  /** X-axis value (typically a date string or index) */
  x: string | number;
  /** Y-axis value */
  y: number;
}

// ── Insight Tile Data ──────────────────────────────────────────

export interface InsightTileData {
  /** Unique insight ID */
  id: string;

  /** Insight type */
  type: InsightType;

  /** Severity/tone */
  severity: InsightSeverity;

  /** Short title (1 line) */
  title: string;

  /** Primary value to display (e.g., "42%", "$12.5k", "3 days") */
  value: string | null;

  /** Contextual description (1-2 sentences) */
  description: string;

  /** Sparkline data for mini chart (7-30 points) */
  sparkline: SparklinePoint[] | null;

  /** Trend direction */
  trend: "up" | "down" | "flat" | null;

  /** Delta/change text (e.g., "+12%", "-3") */
  delta: string | null;

  /** Source section/category */
  source: string;

  /** Deep link to detail view */
  href: string | null;

  /** CTA button label */
  actionLabel: string | null;

  /** ISO 8601 — when insight was generated */
  generatedAt: string;

  /** Time range this insight covers (e.g., "last 7 days") */
  timeRange: string | null;

  /** Whether this insight is dismissible */
  dismissible: boolean;

  /** Project context (null = cross-project) */
  projectId: string | null;
  projectName: string | null;
}

// ── API Response ───────────────────────────────────────────────

export interface InsightsResponse {
  insights: InsightTileData[];
  generatedAt: string;
}
