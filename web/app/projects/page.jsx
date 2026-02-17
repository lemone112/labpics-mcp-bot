"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";

export default function ProjectsPage() {
  const { loading, session } = useAuthGuard();
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [name, setName] = useState("");
  const [toast, setToast] = useState({ type: "info", message: "" });
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await apiFetch("/projects");
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
      setActiveProjectId(data?.active_project_id || null);
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Failed to load projects" });
    }
  }, []);

  useEffect(() => {
    if (!loading && session?.authenticated) {
      loadProjects();
    }
  }, [loading, session, loadProjects]);

  async function onCreate(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/projects", { method: "POST", body: { name } });
      setName("");
      setToast({ type: "success", message: "Project created" });
      await loadProjects();
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Create failed" });
    } finally {
      setBusy(false);
    }
  }

  async function onSelect(projectId) {
    setBusy(true);
    try {
      await apiFetch(`/projects/${projectId}/select`, { method: "POST" });
      setActiveProjectId(projectId);
      setToast({ type: "success", message: "Active project updated" });
    } catch (error) {
      setToast({ type: "error", message: error?.message || "Select failed" });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) {
    return <div className="p-8 text-[var(--text-primary)]">Loading...</div>;
  }

  return (
    <PageShell title="Projects" subtitle="Create and select active project for session">
      <div className="space-y-6">
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
                    <TableCell className="font-mono text-xs text-[var(--text-muted)]">{project.id}</TableCell>
                    <TableCell>{new Date(project.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant={activeProjectId === project.id ? "secondary" : "outline"}
                        size="sm"
                        disabled={busy}
                        onClick={() => onSelect(project.id)}
                      >
                        {activeProjectId === project.id ? "Active" : "Select"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!projects.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-[var(--text-muted)]">
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
