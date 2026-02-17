import { redirect } from "next/navigation";

import ControlTowerSectionPage from "@/features/control-tower/section-page";
import { normalizePortfolioSection } from "@/lib/portfolio-sections";

export default function ControlTowerSectionRoute({ params }) {
  const rawSection = String(params?.section || "").toLowerCase();
  const section = normalizePortfolioSection(rawSection);
  if (section !== rawSection) {
    redirect(`/control-tower/${section}`);
  }
  return <ControlTowerSectionPage section={section} />;
}
