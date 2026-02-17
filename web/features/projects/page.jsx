"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";

export default function ProjectsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { projects, activeProjectId, loadingProjects, refreshProjects, activateProject, activatingProjectId } = useProjectPortfolio();
  const [name, setName] = useState("");
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [creating, setCreating] = useState(false);
  const busy = creating || Boolean(activatingProjectId);

  async function onCreate(event) {
    event.preventDefault();
    setCreating(true);
    try {
      await apiFetch("/projects", { method: "POST", body: { name } });
      setName("");
      setToast({ type: "success", message: "Project created" });
      await refreshProjects();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Create failed" });
    } finally {
      setCreating(false);
    }
  }

  async function onSelect(projectId) {
    try {
      await activateProject(projectId);
      setToast({ type: "success", message: "Active project updated" });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Select failed" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Projects" subtitle="Create and select active project for session">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell title="Projects" subtitle="Create and select active project for session">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 md:flex-row" onSubmit={onCreate}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                required
                minLength={2}
                maxLength={160}
              />
              <Button type="submit" disabled={busy}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Project list</CardTitle>
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
                    <TableCell className="font-mono text-xs text-muted-foreground">{project.id}</TableCell>
                    <TableCell>{new Date(project.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant={activeProjectId === project.id ? "secondary" : "outline"}
                        size="sm"
                        disabled={busy}
                        onClick={() => onSelect(project.id)}
                      >
                        {activatingProjectId === String(project.id)
                          ? "Switching..."
                          : activeProjectId === project.id
                            ? "Active"
                            : "Select"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!projects.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No projects yet.
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
