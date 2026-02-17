"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/status-chip";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function JobsPage() {
  const { loading, session } = useAuthGuard();
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [busyJob, setBusyJob] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/jobs/status");
      setStatus(data);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load job status" });
    }
  }, []);

  useEffect(() => {
    if (!loading && session?.authenticated) {
      loadStatus();
    }
  }, [loading, session, loadStatus]);

  async function runJob(path, name) {
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

  return (
    <PageShell title="Jobs" subtitle="Trigger Chatwoot sync and embeddings jobs">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Run jobs</CardTitle>
            <p className="text-sm text-[var(--text-muted)]">
              Trigger ingestion and embeddings tasks for the active project.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button disabled={busyJob.length > 0} onClick={() => runJob("/jobs/chatwoot/sync", "chatwoot_sync")}>
              {busyJob === "chatwoot_sync" ? "Running..." : "Run Chatwoot Sync"}
            </Button>
            <Button variant="secondary" disabled={busyJob.length > 0} onClick={() => runJob("/jobs/embeddings/run", "embeddings_run")}>
              {busyJob === "embeddings_run" ? "Running..." : "Run Embeddings"}
            </Button>
            <Button variant="outline" onClick={loadStatus}>
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
              <StatTile label="Pending" value={status?.rag_counts?.pending ?? 0} />
              <StatTile label="Processing" value={status?.rag_counts?.processing ?? 0} />
              <StatTile label="Ready" value={status?.rag_counts?.ready ?? 0} />
              <StatTile label="Failed" value={status?.rag_counts?.failed ?? 0} />
            </div>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Data footprint</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <StatTile label="Contacts" value={status?.entities?.contacts ?? 0} />
              <StatTile label="Conversations" value={status?.entities?.conversations ?? 0} />
              <StatTile label="Messages" value={status?.entities?.messages ?? 0} />
              <StatTile
                label="DB size"
                value={
                  typeof status?.storage?.database_bytes === "number"
                    ? `${(status.storage.database_bytes / (1024 ** 3)).toFixed(2)} GB`
                    : "-"
                }
                meta={
                  typeof status?.storage?.usage_percent === "number"
                    ? `${status.storage.usage_percent}% of budget`
                    : ""
                }
              />
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
                    <TableCell className="max-w-[260px] truncate text-[var(--status-danger-fg)]">{job.error || "-"}</TableCell>
                  </TableRow>
                ))}
                {!status?.jobs?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-[var(--text-muted)]">
                      No job runs yet.
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
