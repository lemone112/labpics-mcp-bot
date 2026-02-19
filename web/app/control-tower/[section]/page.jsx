import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { normalizePortfolioSection, sectionMeta } from "@/lib/portfolio-sections";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const section = normalizePortfolioSection(resolvedParams?.section);
  const meta = sectionMeta(section);
  return { title: `${meta.label} — Labpics` };
}

const ControlTowerSectionPage = dynamic(
  () => import("@/features/control-tower/section-page"),
  { loading: () => <PageLoadingSkeleton /> }
);

export default async function ControlTowerSectionRoute({ params }) {
  const resolvedParams = await params;
  const rawSection = String(resolvedParams?.section || "").toLowerCase();
  const section = normalizePortfolioSection(rawSection);
  if (section !== rawSection) {
    redirect(`/control-tower/${section}`);
  }
  return <ControlTowerSectionPage section={section} />;
}
