"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectGate } from "@/hooks/use-project-gate";

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ru-RU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

export default function ReportListPage() {
  const { loading, session } = useAuthGuard();
  const { hasProject, loadingProjects } = useProjectGate();
  const { addToast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Filters
  const [filterTemplate, setFilterTemplate] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const loadTemplates = useCallback(async () => {
    if (!hasProject) return;
    try {
      const data = await apiFetch("/reports/templates");
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка загрузки шаблонов" });
    }
  }, [hasProject]);

  const loadReports = useCallback(async () => {
    if (!hasProject) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (filterTemplate !== "all") params.set("template_id", filterTemplate);
      if (filterStatus !== "all") params.set("status", filterStatus);
      params.set("limit", "50");

      const data = await apiFetch(`/reports?${params.toString()}`);
      setReports(Array.isArray(data?.reports) ? data.reports : []);
      setTotal(Number(data?.total || 0));
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка загрузки отчётов" });
    } finally {
      setBusy(false);
    }
  }, [hasProject, filterTemplate, filterStatus]);

  useEffect(() => {
    if (!loading && !loadingProjects && session?.authenticated && hasProject) {
      loadTemplates();
      loadReports();
    }
  }, [loading, loadingProjects, session, hasProject, loadTemplates, loadReports]);

  async function handleGenerate(templateId) {
    setGenerating(true);
    try {
      await apiFetch("/reports/generate", {
        method: "POST",
        body: { template_id: templateId },
        timeoutMs: 60_000,
      });
      addToast({ type: "success", message: "Отчёт сгенерирован" });
      await loadReports();
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка генерации отчёта" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleViewReport(reportId) {
    try {
      const data = await apiFetch(`/reports/${reportId}`);
      setSelectedReport(data?.report || null);
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка загрузки отчёта" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Отчёты" subtitle="Автоматические отчёты по шаблонам">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  if (!hasProject) {
    return (
      <PageShell title="Отчёты" subtitle="Автоматические отчёты по шаблонам">
        <ProjectScopeRequired
          title="Сначала выберите активный проект"
          description="Отчёты формируются в рамках конкретного проекта."
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="Отчёты" subtitle="Автоматические отчёты по шаблонам">
      <div className="space-y-4">
        {/* Templates card */}
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Шаблоны отчётов</CardTitle>
            <Button variant="outline" size="sm" onClick={loadTemplates}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent>
            <Table aria-label="Report templates">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead>Секции</TableHead>
                  <TableHead>Формат</TableHead>
                  <TableHead>Расписание</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id}>
                    <TableCell className="font-medium">{tpl.name}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {tpl.description || "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {Array.isArray(tpl.sections) ? tpl.sections.length : 0} секц.
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs tracking-wide font-semibold">{tpl.format}</span>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{tpl.schedule || "-"}</code>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={generating}
                        disabled={generating}
                        onClick={() => handleGenerate(tpl.id)}
                      >
                        Генерировать
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!templates.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Шаблонов пока нет.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card data-motion-item>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              Сгенерированные отчёты
              {total > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({total})
                </span>
              ) : null}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadReports} loading={busy}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Select value={filterTemplate} onValueChange={setFilterTemplate}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Шаблон" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все шаблоны</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="completed">Завершён</SelectItem>
                  <SelectItem value="generating">Генерация</SelectItem>
                  <SelectItem value="failed">Ошибка</SelectItem>
                  <SelectItem value="pending">Ожидание</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Table aria-label="Generated reports">
              <TableHeader>
                <TableRow>
                  <TableHead>Шаблон</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Формат</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {report.template_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(report.date_range_start)} — {formatDate(report.date_range_end)}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={report.status} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs tracking-wide font-semibold">{report.format}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(report.created_at)}
                    </TableCell>
                    <TableCell>
                      {report.status === "completed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewReport(report.id)}
                        >
                          Просмотр
                        </Button>
                      ) : report.error ? (
                        <span
                          className="max-w-[160px] truncate text-xs text-destructive"
                          title={report.error}
                        >
                          {report.error}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!reports.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Отчётов пока нет.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Report detail viewer */}
        {selectedReport ? (
          <Card data-motion-item>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>
                {selectedReport.template_name} — {formatDate(selectedReport.date_range_start)} —{" "}
                {formatDate(selectedReport.date_range_end)}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedReport(null)}>
                Закрыть
              </Button>
            </CardHeader>
            <CardContent>
              {selectedReport.format === "html" && selectedReport.data?.html ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selectedReport.data.html }}
                />
              ) : (
                <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-4 text-xs">
                  {JSON.stringify(selectedReport.data, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}
