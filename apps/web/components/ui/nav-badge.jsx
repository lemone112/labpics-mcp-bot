"use client";

import { cn } from "@/lib/utils";

// ── Severity Styles ────────────────────────────────────────────

const SEVERITY_STYLES = {
  default: "bg-primary text-primary-foreground",
  warning: "bg-warning text-warning-foreground",
  critical: "bg-destructive text-destructive-foreground",
  info: "bg-muted-foreground text-background",
};

// ── NavBadge ───────────────────────────────────────────────────

/**
 * NavBadge — badge indicator for navigation items.
 *
 * Variants:
 * - count: Shows a number in a pill (e.g., "3", "99+")
 * - dot: Shows a small colored dot (presence indicator)
 * - new: Shows a "NEW" text badge
 *
 * @param {{
 *   variant?: import("@/types/nav-badges").NavBadgeVariant,
 *   severity?: import("@/types/nav-badges").NavBadgeSeverity,
 *   count?: number,
 *   pulse?: boolean,
 *   ariaLabel?: string,
 *   className?: string,
 * }} props
 */
export function NavBadge({
  variant = "count",
  severity = "default",
  count = 0,
  pulse = false,
  ariaLabel,
  className,
}) {
  const severityClass = SEVERITY_STYLES[severity] || SEVERITY_STYLES.default;

  // Don't render count badges with zero items
  if (variant === "count" && count <= 0) return null;

  // Dot variant
  if (variant === "dot") {
    return (
      <span
        className={cn(
          "absolute -right-0.5 -top-0.5 block size-2 rounded-full",
          severityClass,
          pulse && "animate-pulse",
          className,
        )}
        role="status"
        aria-label={ariaLabel || "Есть обновления"}
      />
    );
  }

  // New variant
  if (variant === "new") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-sm px-1 py-px text-[9px] font-bold tracking-wide leading-tight",
          severityClass,
          className,
        )}
        role="status"
        aria-label={ariaLabel || "Новое"}
      >
        NEW
      </span>
    );
  }

  // Count variant (default)
  const displayCount = count > 99 ? "99+" : String(count);

  return (
    <span
      className={cn(
        "inline-flex min-w-[18px] items-center justify-center rounded-full px-1 py-px text-[10px] font-semibold leading-tight",
        severityClass,
        pulse && "animate-pulse",
        className,
      )}
      role="status"
      aria-label={ariaLabel || `${count} ожидающих действий`}
    >
      {displayCount}
    </span>
  );
}

// ── NavBadgeWrapper ────────────────────────────────────────────
// Utility wrapper to position a badge relative to a nav item.

/**
 * Wraps a nav item and positions a NavBadge in the top-right corner.
 *
 * @param {{
 *   badge?: import("@/types/nav-badges").NavBadgeConfig | null,
 *   children: React.ReactNode,
 *   className?: string,
 * }} props
 */
export function NavBadgeWrapper({ badge, children, className }) {
  if (!badge) return children;

  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      <NavBadge
        variant={badge.variant}
        severity={badge.severity}
        count={badge.count}
        pulse={badge.pulse}
        ariaLabel={badge.ariaLabel}
        className="absolute -right-1 -top-1"
      />
    </span>
  );
}
