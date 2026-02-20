"use client";

import { useRef, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  AlertTriangle,
  Trophy,
  BarChart3,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MOTION, motionEnabled } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Type Config ────────────────────────────────────────────────

const TYPE_ICONS = {
  metric: BarChart3,
  alert: AlertTriangle,
  suggestion: Lightbulb,
  summary: BarChart3,
  milestone: Trophy,
};

// ── Severity Config ────────────────────────────────────────────

const SEVERITY_STYLES = {
  positive: {
    border: "border-success/20",
    accent: "text-success",
    bg: "bg-success/5",
    trendBg: "bg-success/10",
  },
  negative: {
    border: "border-destructive/20",
    accent: "text-destructive",
    bg: "bg-destructive/5",
    trendBg: "bg-destructive/10",
  },
  neutral: {
    border: "border-border",
    accent: "text-muted-foreground",
    bg: "bg-card",
    trendBg: "bg-muted",
  },
  warning: {
    border: "border-warning/20",
    accent: "text-warning",
    bg: "bg-warning/5",
    trendBg: "bg-warning/10",
  },
};

// ── Trend Icon ─────────────────────────────────────────────────

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

// ── Sparkline (SVG mini chart) ─────────────────────────────────

function Sparkline({ data, severity = "neutral", className }) {
  if (!data || data.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;

  const values = data.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((point, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.y - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const strokeColor =
    severity === "positive"
      ? "stroke-success"
      : severity === "negative"
        ? "stroke-destructive"
        : severity === "warning"
          ? "stroke-warning"
          : "stroke-muted-foreground";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-6 w-20", className)}
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        className={cn(strokeColor, "opacity-80")}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────

function InsightTileSkeleton({ className }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-5 w-16 rounded-sm" />
        </div>
        <Skeleton className="h-6 w-20 rounded-sm" />
      </div>
      <Skeleton className="mt-3 h-3 w-full rounded-sm" />
      <Skeleton className="mt-1.5 h-3 w-3/4 rounded-sm" />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

/**
 * InsightTile — card component for key insights/metrics.
 *
 * Unlike StatTile (pure numeric KPI), InsightTile combines:
 * - Narrative context (description)
 * - Visual trend (sparkline + trend icon)
 * - Actionable CTA (action button + deep link)
 * - Severity-based styling
 *
 * @param {{
 *   insight: import("@/types/insight-tile").InsightTileData,
 *   loading?: boolean,
 *   onAction?: (insight: import("@/types/insight-tile").InsightTileData) => void,
 *   onDismiss?: (id: string) => void,
 *   className?: string,
 * }} props
 */
export function InsightTile({
  insight,
  loading = false,
  onAction,
  onDismiss,
  className,
}) {
  const tileRef = useRef(null);

  // Entrance animation
  useEffect(() => {
    if (!tileRef.current || !motionEnabled() || loading) return;
    const anim = (async () => {
      const { animate } = await import("animejs");
      return animate(tileRef.current, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: MOTION.durations.base,
        ease: MOTION.easing.standard,
      });
    })();
    // Cancel on unmount is handled by the module reference
  }, [loading]);

  if (loading) return <InsightTileSkeleton className={className} />;
  if (!insight) return null;

  const severity = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.neutral;
  const TypeIcon = TYPE_ICONS[insight.type] || TYPE_ICONS.metric;
  const TrendIcon = insight.trend ? TREND_ICONS[insight.trend] : null;

  const isInteractive = Boolean(insight.href || onAction);

  return (
    <div
      ref={tileRef}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        severity.border,
        severity.bg,
        isInteractive && "cursor-pointer hover:bg-accent/30",
        className,
      )}
      onClick={
        isInteractive
          ? () => {
              if (onAction) onAction(insight);
              else if (insight.href) window.location.href = insight.href;
            }
          : undefined
      }
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {/* Header row: icon + title + dismiss */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeIcon className={cn("size-4 shrink-0", severity.accent)} />
          <span className="text-xs font-medium text-muted-foreground">
            {insight.source}
            {insight.timeRange ? ` \u00b7 ${insight.timeRange}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {insight.sparkline ? (
            <Sparkline data={insight.sparkline} severity={insight.severity} />
          ) : null}

          {insight.dismissible && onDismiss ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(insight.id);
              }}
              className="relative shrink-0 rounded-sm p-0.5 opacity-40 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring after:absolute after:-inset-2 after:content-['']"
              aria-label="Скрыть инсайт"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Value row */}
      {insight.value ? (
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-xl font-semibold">{insight.value}</span>
          {TrendIcon && insight.delta ? (
            <span className={cn("flex items-center gap-0.5 text-sm font-medium", severity.accent)}>
              <TrendIcon className="size-3.5" />
              {insight.delta}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Title */}
      <p className={cn("text-sm font-medium", insight.value ? "mt-1" : "mt-2")}>
        {insight.title}
      </p>

      {/* Description */}
      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
        {insight.description}
      </p>

      {/* Project context */}
      {insight.projectName ? (
        <span className="mt-2 inline-block text-xs text-muted-foreground">
          {insight.projectName}
        </span>
      ) : null}

      {/* CTA */}
      {insight.actionLabel ? (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onAction) onAction(insight);
            }}
          >
            {insight.actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
