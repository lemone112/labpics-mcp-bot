"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useEventStream } from "@/hooks/use-event-stream";
import { usePortfolioMessages } from "@/hooks/use-portfolio-messages";
import { usePortfolioOverview } from "@/hooks/use-portfolio-overview";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { useSseInvalidation } from "@/hooks/use-sse-invalidation";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Toast } from "@/components/ui/toast";
import { LastUpdatedIndicator } from "@/components/ui/last-updated-indicator";
import { normalizePortfolioSection } from "@/lib/portfolio-sections";
import { TITLES, SUBTITLES, PRIMARY_CTA, useFormatters } from "./lib/formatters";
import { AgreementsSection } from "./sections/agreements-section";
import { RisksSection } from "./sections/risks-section";
import { OffersSection } from "./sections/offers-section";
import { MessagesSection } from "./sections/messages-section";

// Heavy chart sections dynamically imported to reduce initial bundle (Recharts is large)
const DashboardCharts = dynamic(
  () => import("./sections/dashboard-charts").then((mod) => mod.DashboardCharts),
  { ssr: false, loading: () => <PageLoadingSkeleton /> }
);
const FinanceSection = dynamic(
  () => import("./sections/finance-section").then((mod) => mod.FinanceSection),
  { ssr: false, loading: () => <PageLoadingSkeleton /> }
);

const CTA_JOBS = {
  dashboard: "/jobs/chatwoot/sync",
  messages: "/jobs/chatwoot/sync",
  agreements: "/jobs/chatwoot/sync",
  risks: "/jobs/chatwoot/sync",
  finance: "/jobs/chatwoot/sync",
  offers: null,
};

export default function ControlTowerSectionPage({ section }) {
  const normalizedSection = normalizePortfolioSection(section);
  const router = useRouter();
  const { loading, session } = useAuthGuard();
  const { selectedProjectIds, selectedProject, isAllProjects, loadingProjects } = useProjectPortfolio();
  const { moneyFormatter, numberFormatter } = useFormatters();
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [ctaBusy, setCtaBusy] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(null);

  const onPrimaryCta = useCallback(async () => {
    const jobPath = CTA_JOBS[normalizedSection];
    if (normalizedSection === "offers") {
      router.push("/offers");
      return;
    }
    if (!jobPath) return;
    setCtaBusy(true);
    try {
      await apiFetch(jobPath, { method: "POST" });
    } catch {
      // Error will surface via overview.error
    } finally {
      setCtaBusy(false);
    }
  }, [normalizedSection, router]);

  // Real-time: SSE event stream (must be above data hooks so sseConnected is available)
  const eventStream = useEventStream({
    enabled: !loading && !loadingProjects && selectedProjectIds.length > 0,
    key: selectedProject?.id || "",
  });

  const overview = usePortfolioOverview({
    projectIds: selectedProjectIds,
    enabled: normalizedSection !== "messages" && selectedProjectIds.length > 0,
    messageLimit: 80,
    cardLimit: 30,
    sseConnected: eventStream.connected,
  });

  const messages = usePortfolioMessages({
    projectId: selectedProject?.id,
    contactGlobalId: selectedPersonId,
    enabled: normalizedSection === "messages" && Boolean(selectedProject?.id),
    limit: 300,
    sseConnected: eventStream.connected,
  });

  // SSE events invalidate react-query cache → automatic refetch
  useSseInvalidation({ lastEvent: eventStream.lastEvent });

  useEffect(() => {
    if (normalizedSection !== "messages") return;
    const persons = Array.isArray(messages.payload?.persons) ? messages.payload.persons : [];
    if (!persons.length) {
      if (selectedPersonId) setSelectedPersonId("");
      return;
    }
    const valid = persons.some((person) => person.contact_global_id === selectedPersonId);
    if (!valid) {
      setSelectedPersonId(messages.payload?.selected_contact_global_id || persons[0]?.contact_global_id || "");
    }
  }, [normalizedSection, messages.payload, selectedPersonId]);

  const activeDataUpdatedAt =
    normalizedSection === "messages"
      ? messages.dataUpdatedAt
      : overview.dataUpdatedAt;

  const activeReload =
    normalizedSection === "messages"
      ? messages.reload
      : overview.reload;

  useEffect(() => {
    if (!activeDataUpdatedAt) return;
    setSecondsAgo(Math.floor((Date.now() - activeDataUpdatedAt) / 1000));
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - activeDataUpdatedAt) / 1000));
    }, 5000);
    return () => clearInterval(timer);
  }, [activeDataUpdatedAt]);

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!selectedProjectIds.length) {
    return (
      <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
        <EmptyState
          title={TITLES[normalizedSection]}
          reason="Нет доступных проектов."
          steps={["Создайте проект", "Выберите его в правом сайдбаре"]}
          primaryAction={<Button onClick={() => router.push("/projects")}>Создать проект</Button>}
        />
      </PageShell>
    );
  }

  const overviewPayload = overview.payload;
  const agreements = Array.isArray(overviewPayload?.agreements) ? overviewPayload.agreements : [];
  const risks = Array.isArray(overviewPayload?.risks) ? overviewPayload.risks : [];

  return (
    <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
      <div className="space-y-4">
        <div data-testid="ct-hero" className="flex flex-wrap items-center justify-between gap-3">
          <Button data-testid="primary-cta" onClick={onPrimaryCta} disabled={ctaBusy}>{PRIMARY_CTA[normalizedSection]}</Button>
          <div data-testid="trust-bar">
            <LastUpdatedIndicator
              secondsAgo={secondsAgo}
              onRefresh={activeReload}
              loading={overview.loading || messages.loading}
              sseConnected={eventStream.connected}
              errorCount={(overview.error ? 1 : 0) + (messages.error ? 1 : 0)}
            />
          </div>
        </div>
        {normalizedSection === "dashboard" ? <DashboardCharts payload={overviewPayload} moneyFormatter={moneyFormatter} numberFormatter={numberFormatter} /> : null}
        {normalizedSection === "messages"
          ? (
            <MessagesSection
              messagesPayload={messages.payload}
              selectedPersonId={selectedPersonId}
              setSelectedPersonId={setSelectedPersonId}
              loadingMessages={messages.loading}
            />
          )
          : null}
        {normalizedSection === "agreements" ? <AgreementsSection agreements={agreements} isAllProjects={isAllProjects} /> : null}
        {normalizedSection === "risks" ? <RisksSection risks={risks} isAllProjects={isAllProjects} /> : null}
        {normalizedSection === "finance" ? <FinanceSection financePayload={overviewPayload?.finances} moneyFormatter={moneyFormatter} numberFormatter={numberFormatter} /> : null}
        {normalizedSection === "offers" ? <OffersSection payload={overviewPayload} isAllProjects={isAllProjects} moneyFormatter={moneyFormatter} /> : null}

        {(overview.error || messages.error)
          ? <Toast type="error" message={overview.error || messages.error} />
          : null}
      </div>
    </PageShell>
  );
}
