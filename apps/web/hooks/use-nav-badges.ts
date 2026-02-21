"use client";

import { useMemo } from "react";
import { useActionQueueCounts } from "@/hooks/use-action-queue";

const CATEGORY_TO_NAV_KEY: Record<string, string> = {
  message: "messages",
  agreement: "agreements",
  risk: "risks",
  finance: "finance",
  offer: "offers",
  project: "projects",
};

const CRITICAL_THRESHOLD = 10;
const WARNING_THRESHOLD = 5;

type NavBadgeConfig = {
  key: string;
  variant: "count";
  severity: "default" | "warning" | "critical";
  count: number;
  ariaLabel: string;
  pulse: boolean;
};

export function useNavBadges(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const { counts, isLoading } = useActionQueueCounts({ enabled });

  const badges = useMemo<Record<string, NavBadgeConfig | null>>(() => {
    const map: Record<string, NavBadgeConfig | null> = {};
    if (!counts?.byCategory) return map;

    for (const [category, count] of Object.entries(counts.byCategory)) {
      const navKey = CATEGORY_TO_NAV_KEY[category];
      if (!navKey || count <= 0) continue;

      let severity: NavBadgeConfig["severity"] = "default";
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

    if (counts.overdue > 0) {
      map.dashboard = {
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
