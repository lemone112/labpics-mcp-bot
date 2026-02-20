"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { Toast } from "@/components/ui/toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function DigestsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const [daily, setDaily] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ type: "info", message: "" });

  const load = useCallback(async () => {
    if (!hasProject) return;
    setBusy(true);
    try {
      const [dailyResp, weeklyResp] = await Promise.all([apiFetch("/digests/daily"), apiFetch("/digests/weekly")]);
      setDaily(Array.isArray(dailyResp?.digests) ? dailyResp.digests : []);
      setWeekly(Array.isArray(weeklyResp?.digests) ? weeklyResp.digests : []);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка загрузки дайджестов" });
    } finally {
      setBusy(false);
    }
  }, [hasProject]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      load();
    }
  }, [loading, loadingProjects, session, hasProject, load]);

  async function generateDaily() {
    try {
      await apiFetch("/digests/daily/generate", { method: "POST" });
      setToast({ type: "success", message: "Ежедневный дайджест сгенерирован" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка генерации ежедневного дайджеста" });
    }
  }

  async function generateWeekly() {
    try {
      await apiFetch("/digests/weekly/generate", { method: "POST" });
      setToast({ type: "success", message: "Еженедельный дайджест сгенерирован" });
      await load();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка генерации еженедельного дайджеста" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Дайджесты" subtitle="Ежедневный операционный дайджест и еженедельный портфельный">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Дайджесты" subtitle="Ежедневная и еженедельная аналитика проекта">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Дайджесты формируются в рамках конкретного проекта."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Дайджесты" subtitle="Ежедневный операционный дайджест и еженедельный портфельный">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Генерация дайджестов</CardTitle>
            <Button variant="outline" size="sm" onClick={load} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={generateDaily}>Генерировать ежедневный</Button>
            <Button variant="secondary" onClick={generateWeekly}>
              Генерировать еженедельный
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>История ежедневных дайджестов</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Daily digests">
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Основные события</TableHead>
                  <TableHead>Главные действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.digest_date}</TableCell>
                    <TableCell>
                      Предложено сигналов: {row.summary?.highlights?.proposed_signals ?? 0}, просроченных задач:{" "}
                      {row.summary?.highlights?.overdue_issues ?? 0}
                    </TableCell>
                    <TableCell>{row.summary?.top_nba?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {!daily.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">Ежедневных дайджестов пока нет.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>История еженедельных дайджестов</CardTitle>
          </CardHeader>
          <CardContent>
            <Table aria-label="Weekly digests">
              <TableHeader>
                <TableRow>
                  <TableHead>Начало недели</TableHead>
                  <TableHead>Открытый пайплайн</TableHead>
                  <TableHead>Главные риски</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weekly.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.week_start}</TableCell>
                    <TableCell>{row.summary?.portfolio?.open_pipeline ?? 0}</TableCell>
                    <TableCell>{row.summary?.risk?.top_risks?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {!weekly.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">Еженедельных дайджестов пока нет.</TableCell>
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
