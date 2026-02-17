"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";

export default function ControlTowerFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { selectedProjectIds, selectedProjects, loadingProjects } = useProjectPortfolio();
  const [payload, setPayload] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [syncingLoops, setSyncingLoops] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  const projectIdsParam = useMemo(() => selectedProjectIds.join(","), [selectedProjectIds]);
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

  const load = useCallback(async () => {
    if (!selectedProjectIds.length) {
      setPayload(null);
      return;
    }
    setLoadingData(true);
    try {
      const data = await apiFetch(
        `/portfolio/overview?project_ids=${encodeURIComponent(projectIdsParam)}&message_limit=50&card_limit=16`
      );
      setPayload(data);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Не удалось загрузить портфель" });
    } finally {
      setLoadingData(false);
    }
  }, [projectIdsParam, selectedProjectIds.length]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated) {
      load();
    }
  }, [loading, loadingProjects, session?.authenticated, load]);

  async function onSyncLoops() {
    if (!selectedProjectIds.length) return;
    setSyncingLoops(true);
    try {
      const result = await apiFetch("/loops/sync", {
        method: "POST",
        body: {
          project_ids: selectedProjectIds,
          limit: 300,
        },
      });
      const loops = result?.loops || {};
      const summary = `Loops: обработано ${loops.processed || 0}, создано ${loops.created || 0}, обновлено ${loops.updated || 0}, ошибок ${loops.failed || 0}.`;
      setToast({ type: loops.failed ? "warning" : "success", message: summary });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Не удалось синхронизировать Loops" });
    } finally {
      setSyncingLoops(false);
    }
  }

  const dashboardTotals = payload?.dashboard?.totals || null;
  const dashboardProjects = Array.isArray(payload?.dashboard?.by_project) ? payload.dashboard.by_project : [];
  const trendData = (Array.isArray(payload?.dashboard?.trend) ? payload.dashboard.trend : []).map((item) => ({
    ...item,
    label: item.period_start ? new Date(item.period_start).toLocaleDateString("ru-RU", { month: "short" }) : "-",
  }));
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const agreements = Array.isArray(payload?.agreements) ? payload.agreements : [];
  const risks = Array.isArray(payload?.risks) ? payload.risks : [];
  const finances = payload?.finances || { totals: null, by_project: [] };
  const offers = payload?.offers || { upsell: [], recent_offers: [], discount_policy: [] };
  const loopsStats = payload?.loops || { contacts_with_email: 0, unique_emails: 0 };

  if (loading || !session) {
    return (
      <PageShell title="Control Tower" subtitle="Портфельный обзор по выбранным проектам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!selectedProjectIds.length) {
    return (
      <PageShell title="Control Tower" subtitle="Портфельный обзор по выбранным проектам">
        <Card id="dashboard" data-motion-item className="scroll-mt-20">
          <CardContent>
            <EmptyState
              title="Выберите хотя бы один проект"
              description="В левом списке отметьте один или несколько проектов. После этого в центре появятся портфельные метрики, переписки, риски и офферы."
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (loadingData && !payload) {
    return (
      <PageShell title="Control Tower" subtitle="Портфельный обзор по выбранным проектам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell title="Control Tower" subtitle="Портфельный обзор по выбранным проектам">
      <div className="space-y-4">
        <Card id="messages" data-motion-item className="scroll-mt-20">
          <CardHeader className="flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle>1) Дашборд по выбранным проектам</CardTitle>
              <p className="text-sm text-muted-foreground">
                Выбрано проектов: {selectedProjects.length}. Источники: Linear, Attio, Chatwoot и RAG.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loadingData}>
                {loadingData ? "Обновление..." : "Обновить"}
              </Button>
              <Button variant="outline" size="sm" onClick={onSyncLoops} disabled={syncingLoops}>
                {syncingLoops ? "Синхронизация Loops..." : "Синхронизировать Loops"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Проектов в срезе" value={dashboardTotals?.selected_projects ?? 0} />
              <StatTile label="Сообщения (7д)" value={dashboardTotals?.messages_7d ?? 0} />
              <StatTile label="Открытые задачи Linear" value={dashboardTotals?.linear_open_issues ?? 0} />
              <StatTile label="Ожидаемая выручка" value={moneyFormatter.format(dashboardTotals?.expected_revenue ?? 0)} />
              <StatTile label="Открытые риски" value={dashboardTotals?.risks_open ?? 0} />
              <StatTile label="Средняя ценность клиента" value={Math.round(dashboardTotals?.avg_client_value_score ?? 0)} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Ценность и здоровье по проектам</p>
                <ChartContainer
                  config={{
                    client_value_score: { label: "Ценность клиента", markerClassName: "bg-primary" },
                    health_score: { label: "Health score", markerClassName: "bg-secondary" },
                  }}
                >
                  <BarChart data={dashboardProjects}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="project_name" tickLine={false} axisLine={false} minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent formatter={(value) => numberFormatter.format(Number(value || 0))} />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="client_value_score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="health_score" fill="hsl(var(--secondary-foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Тренд выручки и затрат</p>
                <ChartContainer
                  config={{
                    expected_revenue: { label: "Ожидаемая выручка", markerClassName: "bg-primary" },
                    costs_amount: { label: "Затраты", markerClassName: "bg-destructive" },
                  }}
                >
                  <AreaChart data={trendData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent formatter={(value) => moneyFormatter.format(Number(value || 0))} />}
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area
                      type="monotone"
                      dataKey="expected_revenue"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.15}
                    />
                    <Area
                      type="monotone"
                      dataKey="costs_amount"
                      stroke="hsl(var(--destructive))"
                      fill="hsl(var(--destructive))"
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>2) Переписки (лента сообщений)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {messages.map((item) => (
                <div key={item.id} className="rounded-md border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{item.project_name}</Badge>
                    <span>{item.sender_type || "unknown"}</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleString("ru-RU") : "-"}</span>
                  </div>
                  <p className="text-sm text-foreground">{item.content}</p>
                </div>
              ))}
              {!messages.length ? <p className="text-sm text-muted-foreground">Нет сообщений по выбранным проектам.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card id="agreements" data-motion-item className="scroll-mt-20">
          <CardHeader>
            <CardTitle>3) Договоренности (карточками из RAG/evidence)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {agreements.map((item) => (
                <div key={item.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{item.project_name}</Badge>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString("ru-RU") : "-"}</span>
                  </div>
                  <p className="text-sm">{item.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.source_table} • {item.source_pk}
                  </p>
                </div>
              ))}
              {!agreements.length ? <p className="text-sm text-muted-foreground">Пока нет найденных договоренностей.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card id="risks" data-motion-item className="scroll-mt-20">
          <CardHeader>
            <CardTitle>4) Риски (карточки и паттерны)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {risks.map((risk) => (
                <div key={`${risk.source}-${risk.id}`} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{risk.project_name}</Badge>
                    <Badge variant={Number(risk.severity) >= 4 ? "destructive" : "secondary"}>
                      Уровень {Math.round(Number(risk.severity || 0))}
                    </Badge>
                    <span className="text-muted-foreground">{risk.source}</span>
                  </div>
                  <p className="text-sm">{risk.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Вероятность: {Math.round(Number(risk.probability || 0) * 100)}%
                  </p>
                </div>
              ))}
              {!risks.length ? <p className="text-sm text-muted-foreground">Открытых рисков по выбранным проектам нет.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card id="finance" data-motion-item className="scroll-mt-20">
          <CardHeader>
            <CardTitle>5) Финансы и юнит-экономика</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Сумма сделок (won)" value={moneyFormatter.format(finances?.totals?.deal_amount || 0)} />
              <StatTile label="Pipeline" value={moneyFormatter.format(finances?.totals?.pipeline_amount || 0)} />
              <StatTile label="Expected revenue" value={moneyFormatter.format(finances?.totals?.expected_revenue || 0)} />
              <StatTile label="Подписанные офферы" value={moneyFormatter.format(finances?.totals?.signed_total || 0)} />
              <StatTile label="Затраты" value={moneyFormatter.format(finances?.totals?.costs_amount || 0)} />
              <StatTile label="Валовая маржа" value={moneyFormatter.format(finances?.totals?.gross_margin || 0)} />
            </div>
            <div className="space-y-2">
              {(Array.isArray(finances?.by_project) ? finances.by_project : []).map((row) => (
                <div key={row.project_id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{row.project_name}</p>
                    <Badge variant="outline">Прогноз: {Math.round(Number(row.forecast_days || 0))} дн.</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-3">
                    <span>Сделка: {moneyFormatter.format(row.deal_amount || 0)}</span>
                    <span>Ожидаемая: {moneyFormatter.format(row.expected_revenue || 0)}</span>
                    <span>Маржа: {moneyFormatter.format(row.gross_margin || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card id="offers" data-motion-item className="scroll-mt-20">
          <CardHeader>
            <CardTitle>6) Офферы и допродажи</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Loops email база</p>
              <p className="text-sm text-muted-foreground">
                Контактов с email: {loopsStats.contacts_with_email || 0}, уникальных адресов: {loopsStats.unique_emails || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Синхронизация запускается кнопкой сверху и может также выполняться по scheduler job `loops_contacts_sync`.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Upsell radar</p>
                <div className="space-y-2">
                  {(Array.isArray(offers.upsell) ? offers.upsell : []).map((item) => (
                    <div key={item.id} className="rounded-md border p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Badge variant="outline">{item.project_name}</Badge>
                        <span className="text-xs text-muted-foreground">score {Math.round(Number(item.score || 0) * 100)}</span>
                      </div>
                      <p className="text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.rationale || "Без пояснения"}</p>
                    </div>
                  ))}
                  {!offers.upsell?.length ? <p className="text-sm text-muted-foreground">Пока нет предложений для допродажи.</p> : null}
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Политика скидок по ценности клиента</p>
                <div className="space-y-2">
                  {(Array.isArray(offers.discount_policy) ? offers.discount_policy : []).map((item) => (
                    <div key={item.project_id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{item.project_name}</span>
                        <Badge variant="secondary">Макс. скидка {item.max_discount_pct}%</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Ценность клиента: {item.client_value_score}</p>
                    </div>
                  ))}
                  {!offers.discount_policy?.length ? (
                    <p className="text-sm text-muted-foreground">Недостаточно данных для расчёта скидочной политики.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Последние офферы</p>
              <div className="space-y-2">
                {(Array.isArray(offers.recent_offers) ? offers.recent_offers : []).map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                    <div>
                      <p className="text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.project_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{moneyFormatter.format(item.total || 0)}</p>
                      <p className="text-xs text-muted-foreground">Скидка {Number(item.discount_pct || 0)}%</p>
                    </div>
                  </div>
                ))}
                {!offers.recent_offers?.length ? <p className="text-sm text-muted-foreground">Офферы пока отсутствуют.</p> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
