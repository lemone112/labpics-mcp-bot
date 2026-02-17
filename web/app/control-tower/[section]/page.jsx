import { redirect } from "next/navigation";

import ControlTowerSectionPage from "@/features/control-tower/section-page";
import { normalizePortfolioSection } from "@/lib/portfolio-sections";

export default async function ControlTowerSectionRoute({ params }) {
  const resolvedParams = await params;
  const rawSection = String(resolvedParams?.section || "").toLowerCase();
  const section = normalizePortfolioSection(rawSection);
  if (section !== rawSection) {
    redirect(`/control-tower/${section}`);
  }
  return <ControlTowerSectionPage section={section} />;
}
