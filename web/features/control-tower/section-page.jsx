"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { usePortfolioMessages } from "@/hooks/use-portfolio-messages";
import { usePortfolioOverview } from "@/hooks/use-portfolio-overview";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { useRecommendationsV2 } from "@/hooks/use-recommendations-v2";
import { PageShell } from "@/components/page-shell";
import { ProjectBadge } from "@/components/project-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import { Toast } from "@/components/ui/toast";
import { normalizePortfolioSection } from "@/lib/portfolio-sections";
import { cn } from "@/lib/utils";

const TITLES = {
  dashboard: "Дашборд",
  recommendations: "Рекомендации",
  messages: "Переписки",
  agreements: "Договоренности",
  risks: "Риски",
  finance: "Финансы и экономика",
  offers: "Офферы",
};

const SUBTITLES = {
  dashboard: "Ключевые графики состояния проектов",
  recommendations: "Next-best-actions с объяснимыми evidence и действиями",
  messages: "Лента сообщений по выбранному проекту и персоне",
  agreements: "Договоренности, извлеченные из RAG/Evidence",
  risks: "Карточки рисков и паттернов",
  finance: "Финансовые и юнит-экономические метрики",
  offers: "Офферы и допродажи по ценности клиента",
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

function formatRiskTypeRu(riskType) {
  const key = String(riskType || "").toLowerCase();
  if (key === "delivery_risk") return "Риск поставки";
  if (key === "finance_risk") return "Финансовый риск";
  if (key === "client_risk") return "Риск по клиенту";
  if (key === "scope_risk") return "Риск scope creep";
  return key || "Риск";
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

function renderDashboardCharts(payload, moneyFormatter, numberFormatter) {
  const charts = payload?.dashboard?.charts || {};
  const health = Array.isArray(charts.health_score) ? charts.health_score : [];
  const velocity = Array.isArray(charts.velocity_completed_issues) ? charts.velocity_completed_issues : [];
  const overdueIssues = Array.isArray(charts.overdue_issues_count) ? charts.overdue_issues_count : [];
  const responsiveness = Array.isArray(charts.client_responsiveness_minutes) ? charts.client_responsiveness_minutes : [];
  const agreements = Array.isArray(charts.agreements_vs_signed_offers) ? charts.agreements_vs_signed_offers : [];
  const risks = Array.isArray(charts.risks_trend) ? charts.risks_trend : [];
  const burnBudget = Array.isArray(charts.burn_vs_budget) ? charts.burn_vs_budget : [];
  const upsell = Array.isArray(charts.upsell_potential_score) ? charts.upsell_potential_score : [];
  const kagScoresByProject = Array.isArray(charts.kag_scores_by_project) ? charts.kag_scores_by_project : [];
  const kagScoreTrend = Array.isArray(charts.kag_scores_trend) ? charts.kag_scores_trend : [];
  const kagForecastProbabilities = Array.isArray(charts.kag_risk_forecast_probabilities)
    ? charts.kag_risk_forecast_probabilities
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Индекс здоровья проекта</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ value: { label: "Индекс", markerClassName: "bg-primary" } }}>
            <AreaChart data={health.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <Area dataKey="value" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Скорость выполнения задач</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ value: { label: "Завершено", markerClassName: "bg-chart-2" } }}>
            <BarChart data={velocity.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Просроченные задачи (Linear)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ value: { label: "Просрочено", markerClassName: "bg-destructive" } }}>
            <LineChart data={overdueIssues.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <Line dataKey="value" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Скорость ответа клиенту (мин)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ value: { label: "Среднее, мин", markerClassName: "bg-chart-3" } }}>
            <LineChart data={responsiveness.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <Line dataKey="value" type="monotone" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Договоренности vs подписанные офферы</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              agreements: { label: "Договоренности", markerClassName: "bg-chart-1" },
              signed_offers: { label: "Подписанные офферы", markerClassName: "bg-chart-4" },
            }}
          >
            <BarChart data={agreements.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="agreements" stackId="a" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="signed_offers" stackId="a" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Динамика рисков</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              count: { label: "Количество рисков", markerClassName: "bg-destructive" },
              severity_avg: { label: "Средняя критичность", markerClassName: "bg-chart-5" },
            }}
          >
            <LineChart data={risks.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="count" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              <Line dataKey="severity_avg" type="monotone" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Факт затрат vs pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              burn: { label: "Факт затрат", markerClassName: "bg-destructive" },
              budget: { label: "Пайплайн", markerClassName: "bg-primary" },
            }}
          >
            <AreaChart data={burnBudget.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(numberValue(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area dataKey="burn" type="monotone" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.12} />
              <Area dataKey="budget" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Потенциал апсейла</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ value: { label: "Индекс апсейла", markerClassName: "bg-primary" } }}>
            <BarChart data={upsell.map((item) => ({ ...item, label: toRuDateLabel(item.point), value: numberValue(item.value) * 100 }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Math.round(numberValue(value))}%`} />} />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>KAG-рейтинги по проектам</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              project_health: { label: "Здоровье", markerClassName: "bg-primary" },
              risk: { label: "Риск", markerClassName: "bg-destructive" },
              client_value: { label: "Ценность клиента", markerClassName: "bg-chart-2" },
              upsell_likelihood: { label: "Вероятность апсейла", markerClassName: "bg-chart-4" },
            }}
          >
            <BarChart data={kagScoresByProject}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="project_health" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="risk" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="client_value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="upsell_likelihood" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>KAG-рейтинги (тренд по снапшотам)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              project_health: { label: "Здоровье", markerClassName: "bg-primary" },
              risk: { label: "Риск", markerClassName: "bg-destructive" },
              client_value: { label: "Ценность клиента", markerClassName: "bg-chart-2" },
              upsell_likelihood: { label: "Вероятность апсейла", markerClassName: "bg-chart-4" },
            }}
          >
            <LineChart data={kagScoreTrend.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => numberFormatter.format(numberValue(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="project_health" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line dataKey="risk" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              <Line dataKey="client_value" type="monotone" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
              <Line dataKey="upsell_likelihood" type="monotone" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>KAG-прогноз рисков (7/14/30 дней)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              probability_7d: { label: "7 дней", markerClassName: "bg-chart-3" },
              probability_14d: { label: "14 дней", markerClassName: "bg-chart-2" },
              probability_30d: { label: "30 дней", markerClassName: "bg-destructive" },
            }}
          >
            <BarChart
              data={kagForecastProbabilities.map((item) => ({
                ...item,
                risk_label: formatRiskTypeRu(item.risk_type),
                probability_7d: numberValue(item.probability_7d) * 100,
                probability_14d: numberValue(item.probability_14d) * 100,
                probability_30d: numberValue(item.probability_30d) * 100,
              }))}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="risk_label" tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Math.round(numberValue(value))}%`} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="probability_7d" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="probability_14d" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="probability_30d" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function renderAgreements(agreements, isAllProjects) {
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
      {!agreements.length ? <p className="text-sm text-muted-foreground">По выбранному фильтру договоренности не найдены.</p> : null}
    </div>
  );
}

function renderRisks(risks, isAllProjects) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {risks.map((risk) => (
        <Card key={`${risk.source}-${risk.id}`} data-motion-item>
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {isAllProjects ? <ProjectBadge projectId={risk.project_id} projectName={risk.project_name} /> : <Badge variant="outline">{risk.project_name}</Badge>}
              <Badge variant={numberValue(risk.severity) >= 4 ? "destructive" : "secondary"}>Критичность {Math.round(numberValue(risk.severity))}</Badge>
              <Badge variant="outline">{risk.source}</Badge>
            </div>
            <p className="text-sm">{risk.title}</p>
            <p className="text-xs text-muted-foreground">
              Вероятность: {Math.round(numberValue(risk.probability) * 100)}% • {risk.updated_at ? new Date(risk.updated_at).toLocaleDateString("ru-RU") : "-"}
            </p>
          </CardContent>
        </Card>
      ))}
      {!risks.length ? <p className="text-sm text-muted-foreground">Риски по выбранному фильтру не найдены.</p> : null}
    </div>
  );
}

function renderFinance(financePayload, moneyFormatter, numberFormatter) {
  const totals = financePayload?.totals || {};
  const byProject = Array.isArray(financePayload?.by_project) ? financePayload.by_project : [];
  const charts = financePayload?.charts || {};

  const revenueByProject = Array.isArray(charts.revenue_by_project) ? charts.revenue_by_project : [];
  const costsByProject = Array.isArray(charts.costs_by_project) ? charts.costs_by_project : [];
  const marginByProject = Array.isArray(charts.margin_by_project) ? charts.margin_by_project : [];
  const burnTrend = Array.isArray(charts.burn_rate_trend) ? charts.burn_rate_trend : [];
  const forecastCompletion = Array.isArray(charts.forecast_completion_days) ? charts.forecast_completion_days : [];
  const budgetActual = Array.isArray(charts.budget_vs_actual) ? charts.budget_vs_actual : [];
  const unitEconomics = Array.isArray(charts.unit_economics_proxy) ? charts.unit_economics_proxy : [];
  const funnelNodes = Array.isArray(charts.funnel_nodes) ? charts.funnel_nodes : [];

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
              <LineChart data={burnTrend.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
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
              <BarChart data={budgetActual.map((item) => ({ ...item, label: toRuDateLabel(item.point) }))}>
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
}

function renderOffers(payload, isAllProjects, moneyFormatter) {
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
            {!offers.upsell?.length ? <p className="text-sm text-muted-foreground">Пока нет возможностей допродажи.</p> : null}
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
          {!offers.recent_offers?.length ? <p className="text-sm text-muted-foreground">Офферы не найдены.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function formatRecommendationCategoryRu(category) {
  const key = String(category || "").trim().toLowerCase();
  const map = {
    waiting_on_client: "Ожидание клиента",
    scope_creep_change_request: "Scope creep / CR",
    delivery_risk: "Delivery risk",
    finance_risk: "Finance risk",
    upsell_opportunity: "Upsell opportunity",
    winback: "Winback",
  };
  return map[key] || key || "Рекомендация";
}

function formatRecommendationStatusRu(status) {
  const key = String(status || "").trim().toLowerCase();
  const map = {
    new: "Новая",
    acknowledged: "В работе",
    done: "Выполнено",
    dismissed: "Отклонено",
  };
  return map[key] || key || "Неизвестно";
}

function formatActionTypeRu(actionType) {
  const key = String(actionType || "").trim().toLowerCase();
  const map = {
    create_or_update_task: "Создать / обновить задачу",
    send_message: "Отправить сообщение",
    set_reminder: "Поставить напоминание",
  };
  return map[key] || key || "Действие";
}

function renderEvidenceRefLabel(ref) {
  if (!ref || typeof ref !== "object") return "evidence";
  if (ref.message_id) return `Сообщение: ${ref.message_id}`;
  if (ref.linear_issue_id) return `Linear: ${ref.linear_issue_id}`;
  if (ref.attio_record_id) return `Attio: ${ref.attio_record_id}`;
  if (ref.doc_url) return "Документ";
  if (ref.rag_chunk_id) return `RAG chunk: ${ref.rag_chunk_id}`;
  return "Источник";
}

function renderRecommendations({
  recommendations,
  loading,
  isAllProjects,
  selectedRecommendationId,
  onSelectRecommendation,
  onRunAction,
  onUpdateStatus,
  actionRunsByRecommendation,
  actionLoading,
  onRetryAction,
}) {
  if (loading) {
    return (
      <Card data-motion-item>
        <CardContent className="pt-4 text-sm text-muted-foreground">Загрузка рекомендаций...</CardContent>
      </Card>
    );
  }
  if (!recommendations.length) {
    return (
      <Card data-motion-item>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Рекомендации пока не сгенерированы или скрыты evidence gating.
        </CardContent>
      </Card>
    );
  }

  const selected =
    recommendations.find((item) => item.id === selectedRecommendationId) ||
    recommendations[0] ||
    null;
  const selectedEvidence = Array.isArray(selected?.evidence_refs) ? selected.evidence_refs : [];
  const selectedActions = actionRunsByRecommendation[selected?.id] || [];
  const selectedSignals = selected?.signal_snapshot && typeof selected.signal_snapshot === "object"
    ? Object.keys(selected.signal_snapshot)
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
      <Card data-motion-item>
        <CardHeader>
          <CardTitle>Список рекомендаций</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.map((item) => {
            const active = item.id === selected?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectRecommendation(item.id)}
                className={cn(
                  "w-full rounded-md border p-3 text-left transition-colors",
                  active ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {isAllProjects ? (
                    <ProjectBadge projectId={item.project_id} projectName={item.project_name} />
                  ) : null}
                  <Badge variant="outline">{formatRecommendationCategoryRu(item.category)}</Badge>
                  <Badge variant={Number(item.priority) >= 5 ? "destructive" : "secondary"}>
                    P{Number(item.priority) || 0}
                  </Badge>
                  <Badge variant="outline">{formatRecommendationStatusRu(item.status)}</Badge>
                </div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Evidence: {Number(item.evidence_count || 0)} • quality {Math.round(Number(item.evidence_quality_score || 0) * 100)}%
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card data-motion-item>
        <CardHeader>
          <CardTitle>{selected?.title || "Детали рекомендации"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{formatRecommendationCategoryRu(selected.category)}</Badge>
                <Badge variant={Number(selected.priority) >= 5 ? "destructive" : "secondary"}>Приоритет {selected.priority}</Badge>
                <Badge variant="outline">{formatRecommendationStatusRu(selected.status)}</Badge>
                {selected.due_date ? <Badge variant="outline">Срок: {selected.due_date}</Badge> : null}
                {selected.owner_role ? <Badge variant="outline">Роль: {selected.owner_role}</Badge> : null}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">Почему я это вижу</p>
                <p className="text-sm">{selected.rationale || "Без rationale"}</p>
                {selected.why_now ? <p className="text-sm text-muted-foreground">{selected.why_now}</p> : null}
                {selected.expected_impact ? <p className="text-sm">Ожидаемый эффект: {selected.expected_impact}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Gate: {selected.evidence_gate_status || "-"} • Evidence {Number(selected.evidence_count || 0)} • Quality{" "}
                  {Math.round(Number(selected.evidence_quality_score || 0) * 100)}%
                </p>
                {selected.evidence_gate_reason ? (
                  <p className="text-xs text-muted-foreground">Причина gate: {selected.evidence_gate_reason}</p>
                ) : null}
                {selectedSignals.length ? (
                  <p className="text-xs text-muted-foreground">Ключевые сигналы: {selectedSignals.join(", ")}</p>
                ) : null}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">Доказательства</p>
                {selectedEvidence.length ? (
                  <div className="space-y-2">
                    {selectedEvidence.map((ref, idx) => (
                      <div key={`${selected.id}-evidence-${idx}`} className="rounded border p-2 text-xs">
                        <p className="font-medium">{renderEvidenceRefLabel(ref)}</p>
                        {ref?.doc_url ? (
                          <a href={ref.doc_url} target="_blank" rel="noreferrer" className="text-primary underline">
                            {ref.doc_url}
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Evidence не найден.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">Действия</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => onRunAction(selected.id, "create_or_update_task", { due_date: selected.due_date })}
                  >
                    Создать / обновить задачу
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => onRunAction(selected.id, "send_message", { message: selected.suggested_template || selected.title })}
                  >
                    Отправить сообщение
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => onRunAction(selected.id, "set_reminder", { remind_at: selected.due_date })}
                  >
                    Поставить напоминание
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(selected.id, "acknowledged")}>
                    В работу
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(selected.id, "done")}>
                    Выполнено
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onUpdateStatus(selected.id, "dismissed")}>
                    Отклонить
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground">Лог действий</p>
                {selectedActions.length ? (
                  selectedActions.map((run) => {
                    const canRetry = run.status === "failed" && Number(run.attempts || 0) < Number(run.max_retries || 0);
                    return (
                      <div key={run.id} className="rounded border p-2 text-xs">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatActionTypeRu(run.action_type)}</Badge>
                          <Badge variant={run.status === "succeeded" ? "secondary" : run.status === "failed" ? "destructive" : "outline"}>
                            {run.status}
                          </Badge>
                          <span className="text-muted-foreground">attempts: {run.attempts}/{run.max_retries}</span>
                        </div>
                        {run.error_message ? <p className="text-destructive">{run.error_message}</p> : null}
                        {canRetry ? (
                          <Button size="sm" variant="ghost" onClick={() => onRetryAction(run.id)}>
                            Повторить
                          </Button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Действия по этой рекомендации ещё не выполнялись.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Выберите рекомендацию из списка слева.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MessagesSection({ messagesPayload, selectedPersonId, setSelectedPersonId, loadingMessages }) {
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
            {!loadingMessages && !messages.length ? <p className="text-sm text-muted-foreground">Сообщений не найдено.</p> : null}
            <div ref={bottomRef} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ControlTowerSectionPage({ section }) {
  const normalizedSection = normalizePortfolioSection(section);
  const { loading, session } = useAuthGuard();
  const { selectedProjectIds, selectedProject, isAllProjects, loadingProjects, activeProjectId } = useProjectPortfolio();
  const { moneyFormatter, numberFormatter } = useFormatters();
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedRecommendationId, setSelectedRecommendationId] = useState("");
  const [actionsByRecommendation, setActionsByRecommendation] = useState({});
  const [recommendationActionPending, setRecommendationActionPending] = useState(false);
  const [recommendationActionError, setRecommendationActionError] = useState("");
  const scopeReady = Boolean(activeProjectId);

  const overview = usePortfolioOverview({
    projectIds: selectedProjectIds,
    enabled: scopeReady && !["messages", "recommendations"].includes(normalizedSection) && selectedProjectIds.length > 0,
    messageLimit: 80,
    cardLimit: 30,
  });

  const messages = usePortfolioMessages({
    projectId: selectedProject?.id,
    contactGlobalId: selectedPersonId,
    enabled: scopeReady && normalizedSection === "messages" && Boolean(selectedProject?.id),
    limit: 300,
  });

  const recommendations = useRecommendationsV2({
    projectIds: selectedProjectIds,
    enabled: scopeReady && normalizedSection === "recommendations" && selectedProjectIds.length > 0,
    allProjects: isAllProjects,
    limit: 120,
  });

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

  useEffect(() => {
    if (normalizedSection !== "recommendations") return;
    const list = Array.isArray(recommendations.items) ? recommendations.items : [];
    if (!list.length) {
      if (selectedRecommendationId) setSelectedRecommendationId("");
      return;
    }
    const valid = list.some((item) => item.id === selectedRecommendationId);
    if (!valid) {
      setSelectedRecommendationId(list[0].id);
    }
  }, [normalizedSection, recommendations.items, selectedRecommendationId]);

  useEffect(() => {
    if (normalizedSection !== "recommendations") return;
    if (!selectedRecommendationId) return;
    let cancelled = false;
    recommendations
      .listActions(selectedRecommendationId, 30)
      .then((rows) => {
        if (cancelled) return;
        setActionsByRecommendation((prev) => ({
          ...prev,
          [selectedRecommendationId]: rows,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setActionsByRecommendation((prev) => ({
          ...prev,
          [selectedRecommendationId]: [],
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedSection, selectedRecommendationId, recommendations.listActions]);

  async function handleRecommendationStatusUpdate(recommendationId, nextStatus) {
    try {
      setRecommendationActionError("");
      await recommendations.updateStatus(recommendationId, nextStatus);
    } catch (error) {
      setRecommendationActionError(error?.message || "Не удалось обновить статус рекомендации");
    }
  }

  async function handleRecommendationAction(recommendationId, actionType, actionPayload = {}) {
    try {
      setRecommendationActionPending(true);
      setRecommendationActionError("");
      await recommendations.runAction(recommendationId, actionType, actionPayload);
      const runs = await recommendations.listActions(recommendationId, 30);
      setActionsByRecommendation((prev) => ({
        ...prev,
        [recommendationId]: runs,
      }));
      await recommendations.reload();
    } catch (error) {
      setRecommendationActionError(error?.message || "Не удалось выполнить действие по рекомендации");
    } finally {
      setRecommendationActionPending(false);
    }
  }

  async function handleRecommendationActionRetry(actionRunId) {
    try {
      setRecommendationActionPending(true);
      setRecommendationActionError("");
      await recommendations.retryAction(actionRunId);
      if (selectedRecommendationId) {
        const runs = await recommendations.listActions(selectedRecommendationId, 30);
        setActionsByRecommendation((prev) => ({
          ...prev,
          [selectedRecommendationId]: runs,
        }));
      }
      await recommendations.reload();
    } catch (error) {
      setRecommendationActionError(error?.message || "Не удалось повторить действие");
    } finally {
      setRecommendationActionPending(false);
    }
  }

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
        <Card data-motion-item>
          <CardContent>
            <EmptyState title="Нет доступных проектов" description="Создайте проект и выберите его в правом сайдбаре." />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!scopeReady) {
    return (
      <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
        <Card data-motion-item>
          <CardContent>
            <EmptyState
              title="Подготавливаем рабочий контекст"
              description="Назначаем активный проект для account scope. Если статус не обновился, выберите проект вручную в сайдбаре."
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const overviewPayload = overview.payload;
  const agreements = Array.isArray(overviewPayload?.agreements) ? overviewPayload.agreements : [];
  const risks = Array.isArray(overviewPayload?.risks) ? overviewPayload.risks : [];

  return (
    <PageShell title={TITLES[normalizedSection]} subtitle={SUBTITLES[normalizedSection]}>
      <div className="space-y-4">
        {normalizedSection === "dashboard" ? renderDashboardCharts(overviewPayload, moneyFormatter, numberFormatter) : null}
        {normalizedSection === "recommendations"
          ? renderRecommendations({
            recommendations: recommendations.items,
            loading: recommendations.loading,
            isAllProjects,
            selectedRecommendationId,
            onSelectRecommendation: setSelectedRecommendationId,
            onRunAction: handleRecommendationAction,
            onUpdateStatus: handleRecommendationStatusUpdate,
            actionRunsByRecommendation: actionsByRecommendation,
            actionLoading: recommendationActionPending,
            onRetryAction: handleRecommendationActionRetry,
          })
          : null}
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
        {normalizedSection === "agreements" ? renderAgreements(agreements, isAllProjects) : null}
        {normalizedSection === "risks" ? renderRisks(risks, isAllProjects) : null}
        {normalizedSection === "finance" ? renderFinance(overviewPayload?.finances, moneyFormatter, numberFormatter) : null}
        {normalizedSection === "offers" ? renderOffers(overviewPayload, isAllProjects, moneyFormatter) : null}

        {(overview.error || messages.error || recommendations.error || recommendationActionError)
          ? <Toast type="error" message={overview.error || messages.error || recommendations.error || recommendationActionError} />
          : null}
      </div>
    </PageShell>
  );
}
