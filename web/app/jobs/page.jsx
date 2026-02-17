"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { Toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";

export default function JobsPage() {
  const router = useRouter();
  const { loading, session } = useAuthGuard();
  const {
    loading: projectLoading,
    activeProject,
    error: projectError,
    refresh: refreshProjectContext,
  } = useProjectContext(!loading && session?.authenticated);
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [busyJob, setBusyJob] = useState("");

  const loadStatus = useCallback(async () => {
    if (!activeProject?.id) {
      setStatus(null);
      return;
    }
    try {
      const data = await apiFetch("/jobs/status");
      setStatus(data);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load job status" });
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (!loading && session?.authenticated && activeProject?.id) {
      loadStatus();
    }
  }, [loading, session, activeProject?.id, loadStatus]);

  async function runJob(path, name) {
    if (!activeProject?.id) {
      setToast({ type: "error", message: "Select an active project before running jobs." });
      return;
    }
    setBusyJob(name);
    try {
      await apiFetch(path, { method: "POST", timeoutMs: 60_000 });
      setToast({ type: "success", message: `${name} completed` });
      await loadStatus();
    } catch (error) {
      setToast({ type: "error", message: error?.message || `${name} failed` });
    } finally {
      setBusyJob("");
    }
  }

  if (loading || !session) {
    return <div className="p-8 text-sm">Loading...</div>;
  }

  if (projectLoading && !activeProject) {
    return (
      <PageShell title="Jobs" subtitle="Run sync and embeddings for the active project">
        <EmptyState title="Loading active project scope..." description="Checking session project context before running jobs." />
      </PageShell>
    );
  }

  if (!projectLoading && !activeProject) {
    return (
      <PageShell title="Jobs" subtitle="Run sync and embeddings for the active project">
        <EmptyState
          title="No active project selected"
          description={
            projectError
              ? "Project context failed to load. Open Projects and re-select active scope."
              : "Jobs are scope-bound. Select a project first to avoid context leaks."
          }
          actions={
            <>
              <Button onClick={() => router.push("/projects")}>Open Projects</Button>
              <Button variant="outline" onClick={refreshProjectContext}>
                Retry context
              </Button>
            </>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Jobs"
      subtitle={
        activeProject
          ? `Trigger Chatwoot sync and embeddings for project: ${activeProject.name}`
          : "Loading active project scope..."
      }
    >
      <div className="space-y-6">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Run jobs</CardTitle>
            <p className="text-sm text-[var(--text-muted)]">
              Trigger ingestion and embeddings tasks for the active project.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              disabled={busyJob.length > 0 || !activeProject}
              onClick={() => runJob("/jobs/chatwoot/sync", "chatwoot_sync")}
            >
              {busyJob === "chatwoot_sync" ? "Running..." : "Run Chatwoot Sync"}
            </Button>
            <Button
              variant="secondary"
              disabled={busyJob.length > 0 || !activeProject}
              onClick={() => runJob("/jobs/embeddings/run", "embeddings_run")}
            >
              {busyJob === "embeddings_run" ? "Running..." : "Run Embeddings"}
            </Button>
            <Button variant="outline" onClick={loadStatus} disabled={!activeProject}>
              Refresh status
            </Button>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>RAG counts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Pending</div>
                <div className="text-xl font-semibold">{status?.rag_counts?.pending ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Processing</div>
                <div className="text-xl font-semibold">{status?.rag_counts?.processing ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Ready</div>
                <div className="text-xl font-semibold">{status?.rag_counts?.ready ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Failed</div>
                <div className="text-xl font-semibold">{status?.rag_counts?.failed ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Data footprint</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Contacts</div>
                <div className="text-xl font-semibold">{status?.entities?.contacts ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Conversations</div>
                <div className="text-xl font-semibold">{status?.entities?.conversations ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">Messages</div>
                <div className="text-xl font-semibold">{status?.entities?.messages ?? 0}</div>
              </div>
              <div className="app-inset border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="text-xs text-[var(--text-muted)]">DB size</div>
                <div className="text-xl font-semibold">
                  {typeof status?.storage?.database_bytes === "number"
                    ? `${(status.storage.database_bytes / (1024 ** 3)).toFixed(2)} GB`
                    : "-"}
                </div>
                <div className="mt-1 text-xs text-[var(--text-subtle)]">
                  {typeof status?.storage?.usage_percent === "number"
                    ? `${status.storage.usage_percent}% of budget`
                    : ""}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Latest job runs</CardTitle>
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
                      <StatusChip status={job.status} />
                    </TableCell>
                    <TableCell>{job.started_at ? new Date(job.started_at).toLocaleString() : "-"}</TableCell>
                    <TableCell>{job.processed_count}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-rose-600">{job.error || "-"}</TableCell>
                  </TableRow>
                ))}
                {!status?.jobs?.length ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        title="No job runs yet"
                        description="Start with Chatwoot Sync, then run Embeddings to populate searchable memory."
                      />
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
