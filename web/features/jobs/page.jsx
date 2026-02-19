"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { Toast } from "@/components/ui/toast";
import { LastUpdatedIndicator } from "@/components/ui/last-updated-indicator";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useEventStream } from "@/hooks/use-event-stream";
import { useProjectGate } from "@/hooks/use-project-gate";

export default function JobsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, projectId: gateProjectId, loadingProjects } = useProjectGate();
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [busyJob, setBusyJob] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/jobs/status");
      setStatus(data);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Ошибка загрузки статуса задач" });
    }
  }, []);

  const autoRefresh = useAutoRefresh(loadStatus, 15_000, {
    enabled: !loading && !loadingProjects && session?.authenticated && hasProject,
  });

  // Real-time: refresh job status when any job completes via SSE (500ms debounce)
  const eventStream = useEventStream({
    enabled: !loading && !loadingProjects && session?.authenticated && hasProject,
    key: gateProjectId || "",
  });
  const sseTimerRef = useRef(null);
  useEffect(() => {
    if (!eventStream.lastEvent) return;
    clearTimeout(sseTimerRef.current);
    sseTimerRef.current = setTimeout(() => loadStatus(), 500);
    return () => clearTimeout(sseTimerRef.current);
  }, [eventStream.lastEvent, loadStatus]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      loadStatus();
    }
  }, [loading, loadingProjects, session, hasProject, loadStatus]);

  async function runJob(path, name) {
    setBusyJob(name);
    try {
      await apiFetch(path, { method: "POST", timeoutMs: 60_000 });
      setToast({ type: "success", message: `${name} завершена` });
      await loadStatus();
    } catch (error) {
      setToast({ type: "error", message: error?.message || `${name} — ошибка` });
    } finally {
      setBusyJob("");
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Задачи" subtitle="Запуск задач синхронизации, обогащения и загрузки данных">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Задачи" subtitle="Синхронизация Chatwoot и задачи по эмбеддингам">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Jobs выполняются в контексте проекта. Выберите проект и повторите запуск."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Задачи" subtitle="Запуск задач синхронизации, обогащения и загрузки данных">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Запуск задач</CardTitle>
            <p className="text-sm text-muted-foreground">
              Запуск задач Chatwoot, Attio, Linear, эмбеддингов и планировщика с телеметрией.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button disabled={busyJob.length > 0} onClick={() => runJob("/jobs/chatwoot/sync", "chatwoot_sync")}>
              {busyJob === "chatwoot_sync" ? "Выполняется..." : "Синхронизация Chatwoot"}
            </Button>
            <Button variant="secondary" disabled={busyJob.length > 0} onClick={() => runJob("/jobs/attio/sync", "attio_sync")}>
              {busyJob === "attio_sync" ? "Выполняется..." : "Синхронизация Attio"}
            </Button>
            <Button variant="secondary" disabled={busyJob.length > 0} onClick={() => runJob("/jobs/linear/sync", "linear_sync")}>
              {busyJob === "linear_sync" ? "Выполняется..." : "Синхронизация Linear"}
            </Button>
            <Button variant="secondary" disabled={busyJob.length > 0} onClick={() => runJob("/jobs/embeddings/run", "embeddings_run")}>
              {busyJob === "embeddings_run" ? "Выполняется..." : "Генерация эмбеддингов"}
            </Button>
            <Button variant="outline" disabled={busyJob.length > 0} onClick={() => runJob("/jobs/scheduler/tick", "scheduler_tick")}>
              {busyJob === "scheduler_tick" ? "Выполняется..." : "Тик планировщика"}
            </Button>
            <LastUpdatedIndicator
              secondsAgo={autoRefresh.secondsAgo}
              onRefresh={loadStatus}
              loading={busyJob.length > 0}
            />
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Счётчики RAG</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <StatTile label="Ожидание" value={status?.rag_counts?.pending ?? 0} />
              <StatTile label="Обработка" value={status?.rag_counts?.processing ?? 0} />
              <StatTile label="Готов" value={status?.rag_counts?.ready ?? 0} />
              <StatTile label="Ошибка" value={status?.rag_counts?.failed ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Объём данных</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <StatTile label="Контакты" value={status?.entities?.contacts ?? 0} />
              <StatTile label="Диалоги" value={status?.entities?.conversations ?? 0} />
              <StatTile label="Сообщения" value={status?.entities?.messages ?? 0} />
              <StatTile
                label="Размер БД"
                value={
                  typeof status?.storage?.database_bytes === "number"
                    ? `${(status.storage.database_bytes / (1024 ** 3)).toFixed(2)} GB`
                    : "-"
                }
                meta={
                  typeof status?.storage?.usage_percent === "number"
                    ? `${status.storage.usage_percent}% от лимита`
                    : ""
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Последние запуски</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Задача</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Запущена</TableHead>
                  <TableHead>Обработано</TableHead>
                  <TableHead>Ошибка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(status?.jobs || []).map((job) => (
                  <TableRow key={`${job.job_name}-${job.id}`}>
                    <TableCell>{job.job_name}</TableCell>
                    <TableCell>
                      <StatusChip status={job.status} />
                    </TableCell>
                    <TableCell>{job.started_at ? new Date(job.started_at).toLocaleString() : "-"}</TableCell>
                    <TableCell>{job.processed_count}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-destructive">{job.error || "-"}</TableCell>
                  </TableRow>
                ))}
                {!status?.jobs?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Запусков пока нет.
                    </TableCell>
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
