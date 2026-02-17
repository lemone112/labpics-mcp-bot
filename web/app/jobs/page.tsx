"use client";

import { useEffect, useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { getJobsStatus, runChatwootSync, runEmbeddingsJob } from "@/lib/api";
import type { JobsStatusResponse, ToastType } from "@/lib/types";
import { formatDateTime, formatRelativeStorage } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";

export default function JobsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [status, setStatus] = useState<JobsStatusResponse | null>(null);
  const [busyJob, setBusyJob] = useState<"" | "sync" | "embeddings">("");
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({
    type: "info",
    message: "",
  });

  async function loadStatus() {
    if (!activeProject?.id) {
      setStatus(null);
      return;
    }
    try {
      const data = await getJobsStatus();
      setStatus(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load jobs status";
      setToast({ type: "error", message });
    }
  }

  useEffect(() => {
    if (!authLoading && session?.authenticated && activeProject?.id) {
      void loadStatus();
      return;
    }

    setStatus(null);
  }, [authLoading, session?.authenticated, activeProject?.id]);

  async function onRunSync() {
    if (!activeProject?.id) return;
    setBusyJob("sync");
    setToast({ type: "info", message: "" });
    try {
      await runChatwootSync();
      await loadStatus();
      setToast({ type: "success", message: "Chatwoot sync completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      setToast({ type: "error", message });
    } finally {
      setBusyJob("");
    }
  }

  async function onRunEmbeddings() {
    if (!activeProject?.id) return;
    setBusyJob("embeddings");
    setToast({ type: "info", message: "" });
    try {
      await runEmbeddingsJob();
      await loadStatus();
      setToast({ type: "success", message: "Embeddings run completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embeddings failed";
      setToast({ type: "error", message });
    } finally {
      setBusyJob("");
    }
  }

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  const latestSync = status?.jobs?.find((job) => job.job_name === "chatwoot_sync");

  return (
    <PageShell
      title="Jobs"
      subtitle="Run ingestion/memory jobs and monitor bounded processing state."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={
        <>
          <Button variant="outline" onClick={() => void loadStatus()}>
            Refresh status
          </Button>
          <Button disabled={Boolean(busyJob) || !activeProject?.id} onClick={() => void onRunSync()}>
            {busyJob === "sync" ? "Running sync..." : "Run Chatwoot sync"}
          </Button>
          <Button
            variant="secondary"
            disabled={Boolean(busyJob) || !activeProject?.id}
            onClick={() => void onRunEmbeddings()}
          >
            {busyJob === "embeddings" ? "Running embeddings..." : "Run embeddings"}
          </Button>
        </>
      }
    >
      {!activeProject ? (
        <EmptyState
          title="Select active project"
          description="Jobs are now project-scoped. Choose project before running sync or embeddings."
          actionHref="/projects"
          actionLabel="Open Projects"
        />
      ) : (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Job cadence status</CardTitle>
              <CardDescription>
                Bounded jobs and clear status are required for predictable costs.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={busyJob ? "warning" : "success"}>{busyJob ? "running" : "idle"}</Badge>
              <Badge variant="default">latest sync: {latestSync ? formatDateTime(latestSync.started_at) : "-"}</Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Pending chunks" value={status?.rag_counts?.pending ?? 0} />
          <MetricCard label="Processing chunks" value={status?.rag_counts?.processing ?? 0} />
          <MetricCard label="Ready chunks" value={status?.rag_counts?.ready ?? 0} />
          <MetricCard label="Failed chunks" value={status?.rag_counts?.failed ?? 0} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <MetricCard label="Contacts" value={status?.entities?.contacts ?? 0} />
          <MetricCard label="Conversations" value={status?.entities?.conversations ?? 0} />
          <MetricCard label="Messages" value={status?.entities?.messages ?? 0} />
          <Card>
            <CardHeader>
              <CardDescription>Database size</CardDescription>
              <CardTitle>{formatRelativeStorage(status?.storage?.database_bytes)}</CardTitle>
              <p className="text-xs text-slate-400">{status?.storage?.usage_percent ?? 0}% of budget</p>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Latest job runs</CardTitle>
            <CardDescription>Errors should be visible before retrying any process.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(status?.jobs || []).map((job) => (
                  <TableRow key={`${job.job_name}-${job.id}`}>
                    <TableCell>{job.job_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "ok" ? "success" : job.status === "failed" ? "danger" : "warning"
                        }
                      >
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(job.started_at)}</TableCell>
                    <TableCell>{job.processed_count}</TableCell>
                    <TableCell className="max-w-[320px] text-rose-300">{job.error || "-"}</TableCell>
                  </TableRow>
                ))}
                {!status?.jobs?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-slate-400">
                      No jobs executed yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
      )}
    </PageShell>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
