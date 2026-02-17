export const PORTFOLIO_SECTIONS = [
  { key: "dashboard", label: "Дашборд", href: "/control-tower/dashboard" },
  { key: "recommendations", label: "Рекомендации", href: "/control-tower/recommendations" },
  { key: "messages", label: "Переписки", href: "/control-tower/messages" },
  { key: "agreements", label: "Договоренности", href: "/control-tower/agreements" },
  { key: "risks", label: "Риски", href: "/control-tower/risks" },
  { key: "finance", label: "Финансы и экономика", href: "/control-tower/finance" },
  { key: "offers", label: "Офферы и допродажи", href: "/control-tower/offers" },
];

const SECTIONS_WITH_ALL_PROJECTS = new Set(["dashboard", "recommendations", "agreements", "risks", "finance", "offers"]);

export function parsePortfolioSectionFromPath(pathname) {
  const path = String(pathname || "");
  const match = path.match(/^\/control-tower\/([^/?#]+)/);
  const section = match?.[1] || "dashboard";
  return normalizePortfolioSection(section);
}

export function normalizePortfolioSection(section) {
  const normalized = String(section || "").trim().toLowerCase();
  const known = PORTFOLIO_SECTIONS.some((item) => item.key === normalized);
  return known ? normalized : "dashboard";
}

export function sectionAllowsAllProjects(section) {
  return SECTIONS_WITH_ALL_PROJECTS.has(normalizePortfolioSection(section));
}

export function sectionMeta(section) {
  const normalized = normalizePortfolioSection(section);
  return PORTFOLIO_SECTIONS.find((item) => item.key === normalized) || PORTFOLIO_SECTIONS[0];
}
