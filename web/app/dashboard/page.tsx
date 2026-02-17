"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { getConversations, getJobsStatus } from "@/lib/api";
import type { Conversation, JobsStatusResponse, ToastType } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";

export default function DashboardPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProject, refresh: refreshProjects } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [jobs, setJobs] = useState<JobsStatusResponse | null>(null);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({ type: "info", message: "" });

  async function loadData() {
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      const [jobsStatus, conv] = await Promise.all([getJobsStatus(), getConversations(8)]);
      setJobs(jobsStatus);
      setRecentConversations(conv.conversations || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authLoading && session?.authenticated && activeProject?.id) {
      void loadData();
      return;
    }

    setJobs(null);
    setRecentConversations([]);
  }, [authLoading, session?.authenticated, activeProject?.id]);

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  const hasActiveProject = Boolean(activeProject);
  const activeProjectName = activeProject?.name || null;
  const activeProjectId = activeProject?.id || null;

  return (
    <PageShell
      title="Dashboard"
      subtitle="5-minute operational picture: what is active, what is risky, what to do next."
      activeProjectName={activeProjectName}
      activeProjectId={activeProjectId}
      projectCount={projects.length}
      actions={
        <>
          <Button variant="outline" onClick={() => void refreshProjects()}>
            Refresh projects
          </Button>
          <Link
            href="/jobs"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800"
          >
            Run jobs
          </Link>
          <Link
            href="/search"
            className="inline-flex h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-300"
          >
            Open search
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {!hasActiveProject ? (
          <EmptyState
            title="Select active project first"
            description="Without active project the rest of workspace can mix contexts and hide key actions."
            actionHref="/projects"
            actionLabel="Go to Projects"
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>RAG ready chunks</CardDescription>
              <CardTitle>{jobs?.rag_counts?.ready ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Pending chunks</CardDescription>
              <CardTitle>{jobs?.rag_counts?.pending ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Conversations in DB</CardDescription>
              <CardTitle>{jobs?.entities?.conversations ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Last jobs with failure</CardDescription>
              <CardTitle>{(jobs?.jobs || []).filter((job) => job.status === "failed").length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex items-start justify-between gap-2 md:flex-row md:items-center">
            <div>
              <CardTitle>Now / Next actions</CardTitle>
              <CardDescription>Action list inspired by Linear/Attio operating loop.</CardDescription>
            </div>
            <Badge variant="info">Iteration 1</Badge>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-200">
              <li className="rounded-md border border-slate-800 p-3">1. Run Chatwoot sync and embeddings when pending grows.</li>
              <li className="rounded-md border border-slate-800 p-3">2. Review latest conversations and capture project commitments manually.</li>
              <li className="rounded-md border border-slate-800 p-3">3. Use Search to verify evidence before any recommendation.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-start justify-between gap-2 md:flex-row md:items-center">
            <div>
              <CardTitle>Recent conversation activity</CardTitle>
              <CardDescription>Source review view. Click-through details are on Conversations page.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={busy || !activeProject?.id}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inbox</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentConversations.map((conversation) => (
                  <TableRow key={conversation.id}>
                    <TableCell className="font-mono text-xs text-slate-300">{conversation.conversation_id}</TableCell>
                    <TableCell>{conversation.status || "-"}</TableCell>
                    <TableCell>{conversation.inbox_id ?? "-"}</TableCell>
                    <TableCell>{formatDateTime(conversation.updated_at || conversation.created_at)}</TableCell>
                  </TableRow>
                ))}
                {!recentConversations.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-slate-400">
                      No conversations loaded yet. Run sync in Jobs.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roadmap readiness</CardTitle>
            <CardDescription>UI sections prepared for next iteration while API contracts are not final.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { name: "Commitments", status: "UI ready" },
              { name: "Risks", status: "UI ready" },
              { name: "Digest", status: "UI ready" },
              { name: "Settings links", status: "Scaffolded" },
            ].map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-800 p-3">
                <p className="text-sm font-medium text-slate-100">{item.name}</p>
                <p className="mt-1 text-xs text-slate-400">{item.status}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
