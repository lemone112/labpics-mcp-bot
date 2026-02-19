"use client";

import { memo, useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  Line, LineChart, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { StatTile } from "@/components/ui/stat-tile";
import { toRuDateLabel, numberValue, seriesHasVisibleValues } from "../lib/formatters";
import { ChartNoData } from "./chart-no-data";

export const DashboardCharts = memo(function DashboardCharts({ payload, moneyFormatter, numberFormatter }) {
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
        <CardHeader><CardTitle>Индекс здоровья проекта</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Скорость выполнения задач</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Просроченные задачи (Linear)</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Скорость ответа клиенту (мин)</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Договоренности vs подписанные офферы</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Динамика рисков</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Факт затрат vs pipeline</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Потенциал апсейла</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Полнота синхронизации источников</CardTitle></CardHeader>
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
