"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { ProjectScopeRequired } from "@/components/project-scope-required";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [templatesError, setTemplatesError] = useState("");
  const [reportsError, setReportsError] = useState("");

  // Filters
  const [filterTemplate, setFilterTemplate] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const loadTemplates = useCallback(async () => {
    if (!hasProject) return;
    setLoadingTemplates(true);
    try {
      const data = await apiFetch("/reports/templates");
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
      setTemplatesError("");
    } catch (error) {
      const message = error?.message || "Ошибка загрузки шаблонов";
      setTemplatesError(message);
      addToast({ type: "error", message });
    } finally {
      setLoadingTemplates(false);
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
      setReportsError("");
    } catch (error) {
      const message = error?.message || "Ошибка загрузки отчётов";
      setReportsError(message);
      addToast({ type: "error", message });
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
            <Button variant="outline" size="sm" onClick={loadTemplates} loading={loadingTemplates}>
              Обновить
            </Button>
          </CardHeader>
          <CardContent>
            {templatesError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Не удалось загрузить шаблоны</AlertTitle>
                <AlertDescription>{templatesError}</AlertDescription>
              </Alert>
            ) : null}

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
                {loadingTemplates && !templates.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="space-y-2 py-2">
                        <Skeleton className="h-4 w-[28%]" />
                        <Skeleton className="h-4 w-[56%]" />
                        <Skeleton className="h-4 w-[34%]" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
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
                {!busy && !templates.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        title="Шаблонов пока нет"
                        description="Создайте первый шаблон отчёта, чтобы запускать генерацию по расписанию или вручную."
                      />
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
            {reportsError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Ошибка загрузки отчётов</AlertTitle>
                <AlertDescription>{reportsError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Фильтр по шаблону</p>
                <Select value={filterTemplate} onValueChange={setFilterTemplate}>
                  <SelectTrigger className="w-full">
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
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Фильтр по статусу</p>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full">
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
                {busy && !reports.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="space-y-2 py-2">
                        <Skeleton className="h-4 w-[34%]" />
                        <Skeleton className="h-4 w-[52%]" />
                        <Skeleton className="h-4 w-[26%]" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
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
                {!busy && !reports.length ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        title="Отчётов пока нет"
                        description="Сгенерируйте отчёт по шаблону — после этого он появится в списке."
                        actions={
                          <Button variant="outline" size="sm" onClick={loadReports}>
                            Проверить снова
                          </Button>
                        }
                      />
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
                <iframe
                  title={`report-${selectedReport.id}`}
                  className="h-[640px] w-full rounded-md border bg-background"
                  sandbox=""
                  srcDoc={String(selectedReport.data.html)}
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
