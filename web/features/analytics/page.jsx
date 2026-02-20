"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Toast } from "@/components/ui/toast";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function AnalyticsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const [overview, setOverview] = useState(null);
  const [risk, setRisk] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  const load = useCallback(async () => {
    if (!hasProject) return;
    setBusy(true);
    try {
      const [overviewResp, riskResp, evidenceResp] = await Promise.all([
        apiFetch("/analytics/overview"),
        apiFetch("/risk/overview"),
        apiFetch("/analytics/drilldown?limit=30"),
      ]);
      setOverview(overviewResp);
      setRisk(riskResp);
      setEvidence(Array.isArray(evidenceResp?.evidence) ? evidenceResp.evidence : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка загрузки аналитики" });
    } finally {
      setBusy(false);
    }
  }, [hasProject]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      load();
    }
  }, [loading, loadingProjects, session, hasProject, load]);

  async function refreshAnalytics() {
    try {
      await apiFetch("/analytics/refresh", { method: "POST", body: { period_days: 30 } });
      setToast({ type: "success", message: "Снэпшоты аналитики обновлены" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка обновления аналитики" });
    }
  }

  async function refreshRisk() {
    try {
      await apiFetch("/risk/refresh", { method: "POST" });
      setToast({ type: "success", message: "Риски/здоровье обновлены" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка обновления рисков" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Аналитика и риски" subtitle="Прогноз пайплайна, метрики delivery/коммуникаций и drill-down evidence">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Аналитика" subtitle="Прогноз, delivery, коммуникации и метрики рисков">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Аналитика и risk-модели строятся по выбранному проекту."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Аналитика и риски" subtitle="Прогноз пайплайна, метрики delivery/коммуникаций и drill-down evidence">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Обновить снэпшоты</CardTitle>
            <Button variant="outline" size="sm" onClick={load} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={refreshAnalytics}>Обновить аналитику</Button>
            <Button variant="secondary" onClick={refreshRisk}>
              Обновить риски/здоровье
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Метрики портфеля</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <StatTile
                label="Пайплайн (30/60/90)"
                value={
                  Array.isArray(overview?.revenue)
                    ? `$${overview.revenue.reduce((sum, item) => sum + Number(item.pipeline_amount || 0), 0).toLocaleString()}`
                    : "$0"
                }
              />
              <StatTile
                label="Ожидаемая выручка"
                value={
                  Array.isArray(overview?.revenue)
                    ? `$${overview.revenue.reduce((sum, item) => sum + Number(item.expected_revenue || 0), 0).toLocaleString()}`
                    : "$0"
                }
              />
              <StatTile label="Открытые задачи" value={overview?.delivery?.open_issues ?? 0} />
              <StatTile label="Индекс здоровья" value={risk?.health?.score ?? "N/A"} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Снэпшоты прогноза выручки</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Forecast snapshots">
              <TableHeader>
                <TableRow>
                  <TableHead>Горизонт</TableHead>
                  <TableHead>Пайплайн</TableHead>
                  <TableHead>Ожидание</TableHead>
                  <TableHead>Сгенерировано</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.revenue || []).map((row) => (
                  <TableRow key={`${row.horizon_days}-${row.generated_at}`}>
                    <TableCell>{row.horizon_days}d</TableCell>
                    <TableCell>${Number(row.pipeline_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>${Number(row.expected_revenue || 0).toLocaleString()}</TableCell>
                    <TableCell>{row.generated_at ? new Date(row.generated_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!overview?.revenue?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">Снэпшотов пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Радар рисков</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Risk radar">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Критичность</TableHead>
                  <TableHead>Вероятность</TableHead>
                  <TableHead>Митигация</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(risk?.risks || []).map((row, idx) => (
                  <TableRow key={`${row.title}-${idx}`}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.severity}</TableCell>
                    <TableCell>{Number(row.probability || 0).toFixed(2)}</TableCell>
                    <TableCell>{row.mitigation_action}</TableCell>
                  </TableRow>
                ))}
                {!risk?.risks?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">Рисков пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Drill-down доказательств</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Evidence list">
              <TableHeader>
                <TableRow>
                  <TableHead>Источник</TableHead>
                  <TableHead>PK</TableHead>
                  <TableHead>Фрагмент</TableHead>
                  <TableHead>Создан</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.source_table}</TableCell>
                    <TableCell>{row.source_pk}</TableCell>
                    <TableCell>{row.snippet || "-"}</TableCell>
                    <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</TableCell>
                  </TableRow>
                ))}
                {!evidence.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">Доказательств пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
