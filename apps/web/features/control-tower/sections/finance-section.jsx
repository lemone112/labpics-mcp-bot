"use client";

import { memo, useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  Line, LineChart, Pie, PieChart, XAxis, YAxis,
} from "recharts";

import { ProjectBadge } from "@/components/project-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { StatTile } from "@/components/ui/stat-tile";
import { toRuDateLabel, numberValue } from "../lib/formatters";

export const FinanceSection = memo(function FinanceSection({ financePayload, moneyFormatter, numberFormatter }) {
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
            <ChartContainer config={{ value: { label: "Выручка", markerClassName: "bg-primary" } }}>
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
            <ChartContainer config={{ value: { label: "Затраты", markerClassName: "bg-destructive" } }}>
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
            <ChartContainer config={{ value: { label: "Маржа", markerClassName: "bg-chart-2" } }}>
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
            <ChartContainer config={{ burn: { label: "Темп затрат", markerClassName: "bg-destructive" } }}>
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
            <ChartContainer config={{ value: { label: "Дни до завершения", markerClassName: "bg-chart-4" } }}>
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
            <ChartContainer config={{ client_value_score: { label: "Ценность клиента", markerClassName: "bg-chart-5" } }}>
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
            <ChartContainer config={{ amount: { label: "Сумма", markerClassName: "bg-chart-2" } }}>
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
