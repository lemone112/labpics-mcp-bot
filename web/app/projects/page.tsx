"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectContext } from "@/hooks/use-project-context";
import { createProject, selectProject } from "@/lib/api";
import type { ToastType } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";

export default function ProjectsPage() {
  const { loading: authLoading, session } = useAuthGuard();
  const { loading: projectsLoading, projects, activeProjectId, activeProject, refresh } = useProjectContext(
    !authLoading && Boolean(session?.authenticated)
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({ type: "info", message: "" });

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      await createProject(name.trim());
      setName("");
      await refresh();
      setToast({ type: "success", message: "Project created" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project create failed";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  async function onSelect(projectId: string) {
    setBusy(true);
    setToast({ type: "info", message: "" });
    try {
      await selectProject(projectId);
      await refresh();
      setToast({ type: "success", message: "Active project updated" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project select failed";
      setToast({ type: "error", message });
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !session || projectsLoading) {
    return <div className="p-8 text-slate-300">Loading...</div>;
  }

  return (
    <PageShell
      title="Projects"
      subtitle="Create projects and explicitly select active scope for all derived actions."
      activeProjectName={activeProject?.name || null}
      activeProjectId={activeProject?.id || null}
      projectCount={projects.length}
      actions={
        <>
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh list
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription>Without project selection, operations and evidence can become unsafe.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 md:flex-row" onSubmit={onCreate}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name"
                required
                minLength={2}
                maxLength={160}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Creating..." : "Create project"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {!projects.length ? (
          <EmptyState
            title="No projects yet"
            description="Create your first project and set it as active before running jobs and evidence search."
          />
        ) : (
          <Card>
            <CardHeader className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
              <div>
                <CardTitle>Project list</CardTitle>
                <CardDescription>All actions in dashboard should operate against selected active project.</CardDescription>
              </div>
              {activeProject ? <Badge variant="success">Active: {activeProject.name}</Badge> : <Badge variant="warning">Not selected</Badge>}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>{project.name}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">{project.id}</TableCell>
                      <TableCell>{formatDateTime(project.created_at)}</TableCell>
                      <TableCell>
                        <Button
                          variant={activeProjectId === project.id ? "secondary" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() => void onSelect(project.id)}
                        >
                          {activeProjectId === project.id ? "Active" : "Select"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Toast type={toast.type} message={toast.message} />
      </div>
    </PageShell>
  );
}
