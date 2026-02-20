// Dashboard Hierarchy — canonical section layout for the main dashboard.
// Implements the information hierarchy defined in types/dashboard-hierarchy.ts.
// Used by Iter 21 (Page Redesign) to render the dashboard in priority order.

/**
 * @type {import("@/types/dashboard-hierarchy").DashboardSection[]}
 */
export const DASHBOARD_SECTIONS = [
  // ── Zone 1: Hero ──────────────────────────────────────────────
  {
    id: "setup-wizard",
    zone: "hero",
    priority: 1,
    title: "Настройка проекта",
    component: "SetupWizard",
    collapsible: false,
    defaultCollapsed: false,
    visible: true, // conditionally hidden when setup is complete
    minRole: "pm",
    dataSources: ["/setup-wizard/current"],
    gridSpan: 4,
    showViewAll: false,
    viewAllHref: null,
  },
  {
    id: "key-metrics",
    zone: "hero",
    priority: 2,
    title: "Ключевые метрики",
    component: "KeyMetricsRow",
    collapsible: false,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/metrics"],
    gridSpan: 4,
    showViewAll: false,
    viewAllHref: null,
  },

  // ── Zone 2: Actions ───────────────────────────────────────────
  {
    id: "action-queue",
    zone: "actions",
    priority: 1,
    title: "Требует внимания",
    component: "ActionQueuePreview",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/action-queue"],
    gridSpan: 4,
    showViewAll: true,
    viewAllHref: "/action-queue",
  },
  {
    id: "overdue-banner",
    zone: "actions",
    priority: 2,
    title: "Просроченные задачи",
    component: "OverdueBanner",
    collapsible: false,
    defaultCollapsed: false,
    visible: true, // conditionally hidden when no overdue items
    minRole: "pm",
    dataSources: ["/action-queue/counts"],
    gridSpan: 4,
    showViewAll: false,
    viewAllHref: null,
  },

  // ── Zone 3: Insights ──────────────────────────────────────────
  {
    id: "insights",
    zone: "insights",
    priority: 1,
    title: "Инсайты",
    component: "InsightTilesRow",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/insights"],
    gridSpan: 4,
    showViewAll: false,
    viewAllHref: null,
  },

  // ── Zone 4: Overview ──────────────────────────────────────────
  {
    id: "projects-overview",
    zone: "overview",
    priority: 1,
    title: "Проекты",
    component: "ProjectsOverviewTable",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/projects"],
    gridSpan: 4,
    showViewAll: true,
    viewAllHref: "/projects",
  },
  {
    id: "finance-summary",
    zone: "overview",
    priority: 2,
    title: "Финансы",
    component: "FinanceSummary",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "owner",
    dataSources: ["/dashboard/finance"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/control-tower/finance",
  },
  {
    id: "risk-summary",
    zone: "overview",
    priority: 3,
    title: "Риски",
    component: "RiskSummary",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/risks"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/control-tower/risks",
  },

  // ── Zone 5: Activity ──────────────────────────────────────────
  {
    id: "activity-timeline",
    zone: "activity",
    priority: 1,
    title: "Недавняя активность",
    component: "ActivityTimeline",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/activity"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/signals",
  },
  {
    id: "recent-messages",
    zone: "activity",
    priority: 2,
    title: "Последние сообщения",
    component: "RecentMessages",
    collapsible: true,
    defaultCollapsed: false,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/messages"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/control-tower/messages",
  },

  // ── Zone 6: Detail ────────────────────────────────────────────
  {
    id: "charts",
    zone: "detail",
    priority: 1,
    title: "Аналитика",
    component: "DashboardCharts",
    collapsible: true,
    defaultCollapsed: true,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/charts"],
    gridSpan: 4,
    showViewAll: true,
    viewAllHref: "/analytics",
  },
  {
    id: "agreements-upcoming",
    zone: "detail",
    priority: 2,
    title: "Договоренности",
    component: "AgreementsTable",
    collapsible: true,
    defaultCollapsed: true,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/agreements"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/control-tower/agreements",
  },
  {
    id: "offers-pipeline",
    zone: "detail",
    priority: 3,
    title: "Офферы",
    component: "OffersPipeline",
    collapsible: true,
    defaultCollapsed: true,
    visible: true,
    minRole: "pm",
    dataSources: ["/dashboard/offers"],
    gridSpan: 2,
    showViewAll: true,
    viewAllHref: "/control-tower/offers",
  },
];

// ── Zone ordering (canonical priority) ─────────────────────────

const ZONE_ORDER = ["hero", "actions", "insights", "overview", "activity", "detail"];

/**
 * Returns dashboard sections in display order, respecting zone priority
 * and user overrides.
 *
 * @param {{
 *   role?: "pm" | "owner",
 *   overrides?: import("@/types/dashboard-hierarchy").DashboardUserOverrides | null,
 *   setupComplete?: boolean,
 *   hasOverdue?: boolean,
 * }} options
 * @returns {import("@/types/dashboard-hierarchy").DashboardSection[]}
 */
export function getDashboardLayout(options = {}) {
  const { role = "pm", overrides = null, setupComplete = true, hasOverdue = false } = options;

  let sections = DASHBOARD_SECTIONS.filter((section) => {
    // Role check
    if (section.minRole === "owner" && role !== "owner") return false;

    // Conditional sections
    if (section.id === "setup-wizard" && setupComplete) return false;
    if (section.id === "overdue-banner" && !hasOverdue) return false;

    // User hidden sections
    if (overrides?.hiddenSections?.includes(section.id)) return false;

    return section.visible;
  });

  // Apply user section order if provided
  if (overrides?.sectionOrder?.length) {
    const orderMap = new Map(overrides.sectionOrder.map((id, i) => [id, i]));
    sections = sections.sort((a, b) => {
      const aOrder = orderMap.get(a.id);
      const bOrder = orderMap.get(b.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      // Fall back to zone + priority order
      const aZone = ZONE_ORDER.indexOf(a.zone);
      const bZone = ZONE_ORDER.indexOf(b.zone);
      if (aZone !== bZone) return aZone - bZone;
      return a.priority - b.priority;
    });
  } else {
    // Default: sort by zone order, then by priority within zone
    sections = sections.sort((a, b) => {
      const aZone = ZONE_ORDER.indexOf(a.zone);
      const bZone = ZONE_ORDER.indexOf(b.zone);
      if (aZone !== bZone) return aZone - bZone;
      return a.priority - b.priority;
    });
  }

  // Apply collapsed overrides
  if (overrides?.collapsedSections?.length) {
    sections = sections.map((section) => ({
      ...section,
      defaultCollapsed: overrides.collapsedSections.includes(section.id)
        ? true
        : section.defaultCollapsed,
    }));
  }

  return sections;
}

/**
 * Groups sections by zone for rendering.
 *
 * @param {import("@/types/dashboard-hierarchy").DashboardSection[]} sections
 * @returns {Map<import("@/types/dashboard-hierarchy").DashboardZone, import("@/types/dashboard-hierarchy").DashboardSection[]>}
 */
export function groupSectionsByZone(sections) {
  const grouped = new Map();
  for (const zone of ZONE_ORDER) {
    const zoneSections = sections.filter((s) => s.zone === zone);
    if (zoneSections.length > 0) {
      grouped.set(zone, zoneSections);
    }
  }
  return grouped;
}
