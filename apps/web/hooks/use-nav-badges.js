"use client";

import { useMemo } from "react";
import { useActionQueueCounts } from "@/hooks/use-action-queue";

// Maps action queue categories to nav item keys.
// This bridges the action queue system to the navigation UI.
const CATEGORY_TO_NAV_KEY = {
  message: "messages",
  agreement: "agreements",
  risk: "risks",
  finance: "finance",
  offer: "offers",
  project: "projects",
};

// Threshold for "critical" severity on badges
const CRITICAL_THRESHOLD = 10;
const WARNING_THRESHOLD = 5;

/**
 * useNavBadges — derives nav badge configs from action queue counts.
 *
 * Returns a map of nav item keys to badge configs, plus the total
 * count of pending items across all categories.
 *
 * @param {{ enabled?: boolean }} options
 * @returns {import("@/types/nav-badges").NavBadgeState}
 */
export function useNavBadges(options = {}) {
  const { enabled = true } = options;
  const { counts, isLoading } = useActionQueueCounts({ enabled });

  const badges = useMemo(() => {
    /** @type {Record<string, import("@/types/nav-badges").NavBadgeConfig | null>} */
    const map = {};

    if (!counts?.byCategory) return map;

    for (const [category, count] of Object.entries(counts.byCategory)) {
      const navKey = CATEGORY_TO_NAV_KEY[category];
      if (!navKey || count <= 0) continue;

      let severity = "default";
      let pulse = false;

      if (count >= CRITICAL_THRESHOLD) {
        severity = "critical";
        pulse = true;
      } else if (count >= WARNING_THRESHOLD) {
        severity = "warning";
      }

      map[navKey] = {
        key: navKey,
        variant: "count",
        severity,
        count,
        ariaLabel: `${count} ожидающих действий`,
        pulse,
      };
    }

    // If there are overdue items, overlay them on the dashboard badge
    if (counts.overdue > 0) {
      map["dashboard"] = {
        key: "dashboard",
        variant: "count",
        severity: "critical",
        count: counts.overdue,
        ariaLabel: `${counts.overdue} просроченных действий`,
        pulse: true,
      };
    }

    return map;
  }, [counts]);

  return {
    badges,
    totalPending: counts?.total ?? 0,
    isLoading,
  };
}
