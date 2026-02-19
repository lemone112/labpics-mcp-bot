"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Clock3 } from "lucide-react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useEventStream } from "@/hooks/use-event-stream";
import { usePortfolioMessages } from "@/hooks/use-portfolio-messages";
import { usePortfolioOverview } from "@/hooks/use-portfolio-overview";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { PageShell } from "@/components/page-shell";
import { ProjectBadge } from "@/components/project-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { Toast } from "@/components/ui/toast";
import { LastUpdatedIndicator } from "@/components/ui/last-updated-indicator";
import { normalizePortfolioSection } from "@/lib/portfolio-sections";
import { cn } from "@/lib/utils";

const TITLES = {
  dashboard: "Дашборд",
  messages: "Переписки",
  agreements: "Договоренности",
  risks: "Риски",
  finance: "Финансы и экономика",
  offers: "Офферы",
};

const SUBTITLES = {
  dashboard: "Ключевые графики состояния проектов и полноты данных",
  messages: "Лента сообщений по выбранному проекту и персоне",
  agreements: "Договоренности, извлеченные из RAG/Evidence",
  risks: "Карточки рисков и паттернов",
  finance: "Финансовые и юнит-экономические метрики",
  offers: "Офферы и допродажи по ценности клиента",
};

const PRIMARY_CTA = {
  dashboard: "Синхронизировать",
  messages: "Запустить дайджест",
  agreements: "Запустить извлечение",
  risks: "Запустить сканирование",
  finance: "Сгенерировать отчёт",
  offers: "Создать оффер",
};

const EMPTY_WIZARD = {
  dashboard: { reason: "Подключите источники данных для отображения дашборда.", steps: ["Подключите источники данных", "Запустите синхронизацию", "Дождитесь накопления данных"] },
  messages: { reason: "Нет подключённых источников сообщений.", steps: ["Подключите Chatwoot", "Запустите синхронизацию", "Дождитесь загрузки переписок"] },
  agreements: { reason: "Извлечение договорённостей ещё не запускалось.", steps: ["Подключите источники данных", "Запустите извлечение", "Дождитесь анализа"] },
  risks: { reason: "Сканирование рисков ещё не запускалось.", steps: ["Подключите источники данных", "Запустите сканирование", "Дождитесь анализа"] },
  finance: { reason: "Подключите Attio для финансовых данных.", steps: ["Подключите Attio", "Запустите синхронизацию", "Дождитесь анализа"] },
  offers: { reason: "Нет офферов для отображения.", steps: ["Подключите источники данных", "Запустите синхронизацию", "Создайте первый оффер"] },
};

function toRuDateLabel(point, options = { month: "short", day: "numeric" }) {
  if (!point) return "-";
  const date = new Date(point);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ru-RU", options);
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function seriesHasVisibleValues(items, keys = ["value"]) {
  if (!Array.isArray(items) || !items.length) return false;
  return items.some((item) => keys.some((key) => Math.abs(numberValue(item?.[key])) > 0));
}

function ChartNoData({ message = "Недостаточно данных для графика", hint = "После следующего цикла синхронизации график заполнится автоматически." }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-md border border-dashed px-4 text-center">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatRiskSourceRu(source) {
  const key = String(source || "").trim().toLowerCase();
  if (key === "risk_radar") return "Радар риска";
  if (key === "risk_pattern") return "Паттерн";
  if (key === "signal") return "Сигнал";
  return "Источник";
}

function formatRiskSeverityMeta(severityValue) {
  const severity = Math.max(0, Math.round(numberValue(severityValue)));
  if (severity >= 5) return { label: "Критическое влияние", className: "border-destructive/35 bg-destructive/10 text-destructive" };
  if (severity >= 4) return { label: "Высокое влияние", className: "border-warning/30 bg-warning/10 text-warning" };
  if (severity >= 3) return { label: "Среднее влияние", className: "border-warning/20 bg-warning/5 text-warning" };
  if (severity >= 2) return { label: "Низкое влияние", className: "border-border bg-muted text-muted-foreground" };
  return { label: "Минимальное влияние", className: "border-border bg-muted text-muted-foreground" };
}

function formatRiskProbabilityMeta(probabilityValue) {
  const probabilityPct = Math.round(numberValue(probabilityValue) * 100);
  if (probabilityPct >= 70) {
    return { label: `Вероятность ${probabilityPct}%`, className: "border-destructive/35 bg-destructive/10 text-destructive" };
  }
  if (probabilityPct >= 40) {
    return { label: `Вероятность ${probabilityPct}%`, className: "border-warning/30 bg-warning/10 text-warning" };
  }
  return { label: `Вероятность ${Math.max(0, probabilityPct)}%`, className: "border-border bg-muted text-muted-foreground" };
}

function formatRiskTitleRu(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) return "Риск без названия";
  if (title === "Project delivery/commercial risk composite") return "Комбинированный риск delivery и коммерции";
  if (title === "Delivery risk pattern cluster") return "Кластер паттернов delivery-риска";
  return title;
}

function formatHumanDateRu(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTimeRu(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const rtf = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, "month");
}

function compactUniqueRisks(risks, max = 12) {
  if (!Array.isArray(risks)) return [];
  const sorted = [...risks].sort((left, right) => {
    const rightTs = right?.updated_at ? Date.parse(right.updated_at) : 0;
    const leftTs = left?.updated_at ? Date.parse(left.updated_at) : 0;
    if (rightTs !== leftTs) return rightTs - leftTs;
    return numberValue(right?.severity) - numberValue(left?.severity);
  });
  const seen = new Set();
  const compacted = [];
  for (const risk of sorted) {
    const dedupeKey = [
      String(risk?.project_id || ""),
      String(risk?.source || ""),
      String(risk?.title || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    compacted.push(risk);
    if (compacted.length >= max) break;
  }
  return compacted;
}

function useFormatters() {
  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat("ru-RU"), []);
  return { moneyFormatter, numberFormatter };
}

function LinkifiedText({ text }) {
  const source = String(text || "");
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = source.split(urlRegex);

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, idx) => {
        if (/^https?:\/\/\S+$/.test(part)) {
          return (
            <a key={`link-${idx}`} href={part} target="_blank" rel="noreferrer" className="text-primary underline">
              {part}
            </a>
          );
        }
        return <span key={`text-${idx}`}>{part}</span>;
      })}
    </p>
  );
}

const DashboardCharts = memo(function DashboardCharts({ payload, moneyFormatter, numberFormatter }) {
  const totals = payload?.dashboard?.totals || {};
  const rawCharts = payload?.dashboard?.charts;

  const {
    healthData, velocityData, overdueData, responsivenessData,
    agreementsChartData, risksChartData, burnBudgetData, upsellData, syncData,
    hasHealth, hasVelocity, hasOverdue, hasResponsiveness,
    hasAgreements, hasRisks, hasBurnBudget, hasUpsell, hasSync,
  } = useMemo(() => {
    const charts = rawCharts || {};
    const health = Array.isArray(charts.health_score) ? charts.health_score : [];
    const velocity = Array.isArray(charts.velocity_completed_issues) ? charts.velocity_completed_issues : [];
    const overdueIssues = Array.isArray(charts.overdue_issues_count) ? charts.overdue_issues_count : [];
    const responsiveness = Array.isArray(charts.client_responsiveness_minutes) ? charts.client_responsiveness_minutes : [];
    const agreements = Array.isArray(charts.agreements_vs_signed_offers) ? charts.agreements_vs_signed_offers : [];
    const risks = Array.isArray(charts.risks_trend) ? charts.risks_trend : [];
    const burnBudget = Array.isArray(charts.burn_vs_budget) ? charts.burn_vs_budget : [];
    const upsell = Array.isArray(charts.upsell_potential_score) ? charts.upsell_potential_score : [];
    const syncReconciliation = Array.isArray(charts.sync_reconciliation_completeness) ? charts.sync_reconciliation_completeness : [];

    const addLabel = (items) => items.map((item) => ({ ...item, label: toRuDateLabel(item.point) }));

    return {
      healthData: addLabel(health),
      velocityData: addLabel(velocity),
      overdueData: addLabel(overdueIssues),
      responsivenessData: addLabel(responsiveness),
      agreementsChartData: addLabel(agreements),
      risksChartData: addLabel(risks),
      burnBudgetData: addLabel(burnBudget),
      upsellData: upsell.map((item) => ({ ...item, label: toRuDateLabel(item.point), value: numberValue(item.value) * 100 })),
      syncData: addLabel(syncReconciliation),
      hasHealth: seriesHasVisibleValues(health),
      hasVelocity: seriesHasVisibleValues(velocity),
      hasOverdue: seriesHasVisibleValues(overdueIssues),
      hasResponsiveness: seriesHasVisibleValues(responsiveness),
      hasAgreements: seriesHasVisibleValues(agreements, ["agreements", "signed_offers"]),
      hasRisks: seriesHasVisibleValues(risks, ["count", "severity_avg"]),
      hasBurnBudget: seriesHasVisibleValues(burnBudget, ["burn", "budget"]),
      hasUpsell: seriesHasVisibleValues(upsell),
      hasSync: seriesHasVisibleValues(syncReconciliation, ["completeness_pct", "missing_count"]),
    };
  }, [rawCharts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Активные проекты" value={numberFormatter.format(numberValue(totals.selected_projects))} />
        <StatTile label="Сообщений за 7 дней" value={numberFormatter.format(numberValue(totals.messages_7d))} />
        <StatTile label="Открытые риски" value={numberFormatter.format(numberValue(totals.risks_open))} />
        <StatTile label="Полнота синка" value={`${Math.round(numberValue(totals.sync_completeness_pct))}%`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Индекс здоровья проекта</CardTitle>
        </CardHeader>
        <CardContent>
          {hasHealth ? (
            <ChartContainer config={{ value: { label: "Индекс", markerClassName: "bg-primary" } }}>
              <AreaChart data={healthData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <Area dataKey="value" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} dot={{ r: 2 }} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Индекс здоровья появится после накопления истории сигналов." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Скорость выполнения задач</CardTitle>
        </CardHeader>
        <CardContent>
          {hasVelocity ? (
            <ChartContainer config={{ value: { label: "Завершено", markerClassName: "bg-chart-2" } }}>
              <BarChart data={velocityData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Нет завершённых задач за выбранный период." hint="Проверьте синхронизацию Linear." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Просроченные задачи (Linear)</CardTitle>
        </CardHeader>
        <CardContent>
          {hasOverdue ? (
            <ChartContainer config={{ value: { label: "Просрочено", markerClassName: "bg-destructive" } }}>
              <LineChart data={overdueData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <Line dataKey="value" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Просроченных задач пока нет." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Скорость ответа клиенту (мин)</CardTitle>
        </CardHeader>
        <CardContent>
          {hasResponsiveness ? (
            <ChartContainer config={{ value: { label: "Среднее, мин", markerClassName: "bg-chart-3" } }}>
              <LineChart data={responsivenessData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <Line dataKey="value" type="monotone" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Нет данных по времени ответа клиента." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Договоренности vs подписанные офферы</CardTitle>
        </CardHeader>
        <CardContent>
          {hasAgreements ? (
            <ChartContainer
              config={{
                agreements: { label: "Договоренности", markerClassName: "bg-chart-1" },
                signed_offers: { label: "Подписанные офферы", markerClassName: "bg-chart-4" },
              }}
            >
              <BarChart data={agreementsChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="agreements" stackId="a" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="signed_offers" stackId="a" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Пока нет связанной истории по договорённостям и офферам." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Динамика рисков</CardTitle>
        </CardHeader>
        <CardContent>
          {hasRisks ? (
            <ChartContainer
              config={{
                count: { label: "Количество рисков", markerClassName: "bg-destructive" },
                severity_avg: { label: "Средняя критичность", markerClassName: "bg-chart-5" },
              }}
            >
              <LineChart data={risksChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="count" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="severity_avg" type="monotone" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="История рисков ещё не накоплена." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Факт затрат vs pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          {hasBurnBudget ? (
            <ChartContainer
              config={{
                burn: { label: "Факт затрат", markerClassName: "bg-destructive" },
                budget: { label: "Пайплайн", markerClassName: "bg-primary" },
              }}
            >
              <AreaChart data={burnBudgetData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area dataKey="burn" type="monotone" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.12} dot={{ r: 2 }} />
                <Area dataKey="budget" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} dot={{ r: 2 }} />
              </AreaChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Недостаточно данных по затратам и пайплайну." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Потенциал апсейла</CardTitle>
        </CardHeader>
        <CardContent>
          {hasUpsell ? (
            <ChartContainer config={{ value: { label: "Индекс апсейла", markerClassName: "bg-primary" } }}>
              <BarChart data={upsellData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Math.round(numberValue(value))}%`} />} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Сигналы апсейла пока не обнаружены." />
          )}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Полнота синхронизации источников</CardTitle>
        </CardHeader>
        <CardContent>
          {hasSync ? (
            <ChartContainer
              config={{
                completeness_pct: { label: "Полнота, %", markerClassName: "bg-primary" },
                missing_count: { label: "Пропуски", markerClassName: "bg-destructive" },
              }}
            >
              <LineChart data={syncData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="completeness_pct" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="missing_count" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartNoData message="Метрики полноты появятся после цикла reconciliation." />
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
});

const AgreementsSection = memo(function AgreementsSection({ agreements, isAllProjects }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {agreements.map((item) => (
        <Card key={item.id} data-motion-item>
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center justify-between gap-2">
              {isAllProjects ? <ProjectBadge projectId={item.project_id} projectName={item.project_name} /> : <Badge variant="outline">{item.project_name}</Badge>}
              <span className="text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString("ru-RU") : "-"}</span>
            </div>
            <p className="text-sm">{item.summary}</p>
            <p className="text-xs text-muted-foreground">
              {item.source_table} • {item.source_pk}
            </p>
          </CardContent>
        </Card>
      ))}
      {!agreements.length ? (
        <EmptyState
          title="Договоренности"
          reason={EMPTY_WIZARD.agreements.reason}
          steps={EMPTY_WIZARD.agreements.steps}
          primaryAction={<Button>{PRIMARY_CTA.agreements}</Button>}
        />
      ) : null}
    </div>
  );
});

const RisksSection = memo(function RisksSection({ risks, isAllProjects }) {
  const visibleRisks = useMemo(() => compactUniqueRisks(risks, 12), [risks]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Показано {visibleRisks.length} из {Array.isArray(risks) ? risks.length : 0} рисков. Дубликаты автоматически свернуты.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {visibleRisks.map((risk) => {
        const severityMeta = formatRiskSeverityMeta(risk.severity);
        const probabilityMeta = formatRiskProbabilityMeta(risk.probability);
        const updatedAt = formatHumanDateRu(risk.updated_at);
        const relativeTime = formatRelativeTimeRu(risk.updated_at);
        return (
        <Card key={`${risk.source}-${risk.id}`} data-motion-item>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isAllProjects ? <ProjectBadge projectId={risk.project_id} projectName={risk.project_name} /> : <Badge variant="outline">{risk.project_name}</Badge>}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatRiskSourceRu(risk.source)}</Badge>
                <Badge className={cn("border", severityMeta.className)}>{severityMeta.label}</Badge>
              </div>
            </div>
            <p className="text-sm font-medium leading-snug">{formatRiskTitleRu(risk.title)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("border", probabilityMeta.className)}>
                <AlertTriangle className="mr-1 size-3.5" />
                {probabilityMeta.label}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                {updatedAt}
                {relativeTime ? ` (${relativeTime})` : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      );
      })}
      {!visibleRisks.length ? (
        <EmptyState
          title="Риски"
          reason={EMPTY_WIZARD.risks.reason}
          steps={EMPTY_WIZARD.risks.steps}
          primaryAction={<Button>{PRIMARY_CTA.risks}</Button>}
        />
      ) : null}
      </div>
    </div>
  );
});

const FinanceSection = memo(function FinanceSection({ financePayload, moneyFormatter, numberFormatter }) {
  const totals = financePayload?.totals || {};
  const byProject = Array.isArray(financePayload?.by_project) ? financePayload.by_project : [];
  const rawCharts = financePayload?.charts;

  const {
    revenueByProject, costsByProject, marginByProject,
    burnTrendData, forecastCompletion, budgetActualData,
    unitEconomics, funnelNodes,
  } = useMemo(() => {
    const charts = rawCharts || {};
    return {
      revenueByProject: Array.isArray(charts.revenue_by_project) ? charts.revenue_by_project : [],
      costsByProject: Array.isArray(charts.costs_by_project) ? charts.costs_by_project : [],
      marginByProject: Array.isArray(charts.margin_by_project) ? charts.margin_by_project : [],
      burnTrendData: (Array.isArray(charts.burn_rate_trend) ? charts.burn_rate_trend : []).map((item) => ({ ...item, label: toRuDateLabel(item.point) })),
      forecastCompletion: Array.isArray(charts.forecast_completion_days) ? charts.forecast_completion_days : [],
      budgetActualData: (Array.isArray(charts.budget_vs_actual) ? charts.budget_vs_actual : []).map((item) => ({ ...item, label: toRuDateLabel(item.point) })),
      unitEconomics: Array.isArray(charts.unit_economics_proxy) ? charts.unit_economics_proxy : [],
      funnelNodes: Array.isArray(charts.funnel_nodes) ? charts.funnel_nodes : [],
    };
  }, [rawCharts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Сумма сделок" value={moneyFormatter.format(numberValue(totals.deal_amount))} />
        <StatTile label="Пайплайн" value={moneyFormatter.format(numberValue(totals.pipeline_amount))} />
        <StatTile label="Ожидаемая выручка" value={moneyFormatter.format(numberValue(totals.expected_revenue))} />
        <StatTile label="Подписано" value={moneyFormatter.format(numberValue(totals.signed_total))} />
        <StatTile label="Затраты" value={moneyFormatter.format(numberValue(totals.costs_amount))} />
        <StatTile label="Валовая маржа" value={moneyFormatter.format(numberValue(totals.gross_margin))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card data-motion-item>
          <CardHeader><CardTitle>Выручка по проектам</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={revenueByProject}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Затраты по проектам</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={costsByProject}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Маржа</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={marginByProject}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Темп затрат</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <LineChart data={burnTrendData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <Line dataKey="burn" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Прогноз до завершения (дни)</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={forecastCompletion}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${numberFormatter.format(numberValue(value))} дн.`} />} />
                <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>План vs факт</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                budget: { label: "План", markerClassName: "bg-primary" },
                actual: { label: "Факт", markerClassName: "bg-destructive" },
              }}
            >
              <BarChart data={budgetActualData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="budget" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Прокси юнит-экономики</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={unitEconomics}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
                <Bar dataKey="client_value_score" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Воронка (стадии)</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer>
              <PieChart>
                <Pie data={funnelNodes} dataKey="amount" nameKey="stage" outerRadius={80} fill="hsl(var(--chart-2))" />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {byProject.map((row) => (
          <Card key={row.project_id} data-motion-item>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-2">
                <ProjectBadge projectId={row.project_id} projectName={row.project_name} />
                <span className="text-xs text-muted-foreground">Прогноз до закрытия: {Math.round(numberValue(row.forecast_days))} дн.</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
});

const OffersSection = memo(function OffersSection({ payload, isAllProjects, moneyFormatter }) {
  const offers = payload?.offers || { upsell: [], recent_offers: [], discount_policy: [] };
  const loopsStats = payload?.loops || { contacts_with_email: 0, unique_emails: 0 };

  return (
    <div className="space-y-4">
      <Card data-motion-item>
        <CardHeader><CardTitle>Loops база</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Контактов с email: {numberValue(loopsStats.contacts_with_email)}, уникальных email: {numberValue(loopsStats.unique_emails)}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card data-motion-item>
          <CardHeader><CardTitle>Возможности допродажи</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(offers.upsell || []).map((item) => (
              <div key={item.id} className="rounded-md border p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  {isAllProjects ? <ProjectBadge projectId={item.project_id} projectName={item.project_name} /> : <Badge variant="outline">{item.project_name}</Badge>}
                  <Badge variant="secondary">{Math.round(numberValue(item.score) * 100)}%</Badge>
                </div>
                <p className="text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.rationale || "Без описания"}</p>
              </div>
            ))}
            {!offers.upsell?.length ? (
              <EmptyState
                title="Возможности допродажи"
                reason={EMPTY_WIZARD.offers.reason}
                steps={EMPTY_WIZARD.offers.steps}
                primaryAction={<Button>{PRIMARY_CTA.offers}</Button>}
              />
            ) : null}
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader><CardTitle>Политика скидок</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(offers.discount_policy || []).map((item) => (
              <div key={item.project_id} className="rounded-md border p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <ProjectBadge projectId={item.project_id} projectName={item.project_name} />
                  <Badge variant="outline">Макс. скидка {numberValue(item.max_discount_pct)}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Ценность клиента: {numberValue(item.client_value_score)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card data-motion-item>
        <CardHeader><CardTitle>Последние офферы</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(offers.recent_offers || []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <p className="text-sm">{item.title}</p>
                {isAllProjects ? (
                  <ProjectBadge projectId={item.project_id} projectName={item.project_name} className="mt-1" />
                ) : (
                  <p className="text-xs text-muted-foreground">{item.project_name}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm">{moneyFormatter.format(numberValue(item.total))}</p>
                <p className="text-xs text-muted-foreground">Скидка {numberValue(item.discount_pct)}%</p>
              </div>
            </div>
          ))}
          {!offers.recent_offers?.length ? (
            <EmptyState
              title="Последние офферы"
              reason={EMPTY_WIZARD.offers.reason}
              steps={EMPTY_WIZARD.offers.steps}
              primaryAction={<Button>{PRIMARY_CTA.offers}</Button>}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
});

const MessagesSection = memo(function MessagesSection({ messagesPayload, selectedPersonId, setSelectedPersonId, loadingMessages }) {
  const project = messagesPayload?.project || null;
  const persons = Array.isArray(messagesPayload?.persons) ? messagesPayload.persons : [];
  const messages = Array.isArray(messagesPayload?.messages) ? messagesPayload.messages : [];
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [project?.id, selectedPersonId, messages.length]);

  const personName = persons.find((item) => item.contact_global_id === selectedPersonId)?.person_name || "Не выбран";

  return (
    <Card data-motion-item className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Переписки</CardTitle>
          <Badge variant="outline">{project?.name || "-"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-xs">
            <Select
              value={selectedPersonId || persons[0]?.contact_global_id || "none"}
              onValueChange={(value) => setSelectedPersonId(value === "none" ? "" : value)}
            >
              <SelectTrigger aria-label="Выбрать персону клиента">
                <SelectValue placeholder="Выбрать персону" />
              </SelectTrigger>
              <SelectContent>
                {!persons.length ? <SelectItem value="none">Персоны не найдены</SelectItem> : null}
                {persons.map((person) => (
                  <SelectItem key={person.contact_global_id} value={person.contact_global_id}>
                    {person.person_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">Текущая персона: {personName}</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[70svh] overflow-y-auto px-4 py-3">
          <div className="sticky top-0 z-10 mb-3 rounded-md border bg-background/95 px-3 py-2 text-xs backdrop-blur">
            <span className="font-medium">{project?.name || "-"}</span>
            <span className="mx-2 text-muted-foreground">•</span>
            <span className="text-muted-foreground">{personName}</span>
          </div>

          <div className="space-y-3">
            {loadingMessages ? <p className="text-sm text-muted-foreground">Загрузка переписки...</p> : null}
            {!loadingMessages &&
              messages.map((message) => {
                const incoming = message.sender_type === "contact" || message.sender_type === "client";
                return (
                  <div key={message.id} className={cn("flex", incoming ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl border px-3 py-2",
                        incoming ? "rounded-bl-sm bg-muted" : "rounded-br-sm bg-primary text-primary-foreground"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                        <span>{message.author_name || (incoming ? "Клиент" : "Команда")}</span>
                        <span>•</span>
                        <span>{message.channel || "-"}</span>
                      </div>
                      <LinkifiedText text={message.content} />
                      {Array.isArray(message.attachments) && message.attachments.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {message.attachments.map((file) => (
                            <Badge key={file.id} variant="outline" className="text-[11px]">
                              attachment: {file.name}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 text-right text-[11px] opacity-80">
                        {message.created_at ? new Date(message.created_at).toLocaleString("ru-RU") : "-"}
                      </div>
                    </div>
                  </div>
                );
              })}
            {!loadingMessages && !messages.length ? (
              <EmptyState
                title="Переписки"
                reason={EMPTY_WIZARD.messages.reason}
                steps={EMPTY_WIZARD.messages.steps}
                primaryAction={<Button>{PRIMARY_CTA.messages}</Button>}
              />
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default function ControlTowerSectionPage({ section }) {
  const normalizedSection = normalizePortfolioSection(section);
  const { loading, session } = useAuthGuard();
  const { selectedProjectIds, selectedProject, isAllProjects, loadingProjects } = useProjectPortfolio();
  const { moneyFormatter, numberFormatter } = useFormatters();
  const [selectedPersonId, setSelectedPersonId] = useState("");

  // Real-time: SSE event stream (must be above data hooks so sseConnected is available)
  const eventStream = useEventStream({
    enabled: !loading && !loadingProjects && selectedProjectIds.length > 0,
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

  useRealtimeRefresh({ lastEvent: eventStream.lastEvent, reload: overview.reload, dataType: "portfolio" });
  useRealtimeRefresh({ lastEvent: eventStream.lastEvent, reload: messages.reload, dataType: "messages" });


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
          primaryAction={<Button>Создать проект</Button>}
        />
      </PageShell>
    );
  }

  const overviewPayload = overview.payload;
  const agreements = Array.isArray(overviewPayload?.agreements) ? overviewPayload.agreements : [];
  const risks = Array.isArray(overviewPayload?.risks) ? overviewPayload.risks : [];

  const activeAutoRefresh =
    normalizedSection === "messages"
      ? messages.autoRefresh
      : overview.autoRefresh;

  const activeReload =
    normalizedSection === "messages"
      ? messages.reload
      : overview.reload;

  return (
    <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
      <div className="space-y-4">
        <div data-testid="ct-hero" className="flex flex-wrap items-center justify-between gap-3">
          <Button data-testid="primary-cta">{PRIMARY_CTA[normalizedSection]}</Button>
          <div data-testid="trust-bar">
            <LastUpdatedIndicator
              secondsAgo={activeAutoRefresh?.secondsAgo}
              onRefresh={activeReload}
              loading={overview.loading || messages.loading}
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
