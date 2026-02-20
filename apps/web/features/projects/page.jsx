"use client";

import { useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingSkeleton } from "@/components/ui/page-loading-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";

export default function ProjectsFeaturePage() {
  const { loading, session } = useAuthGuard();
  const { projects, activeProjectId, loadingProjects, refreshProjects, activateProject, activatingProjectId } = useProjectPortfolio();
  const [name, setName] = useState("");
  const { addToast } = useToast();
  const [creating, setCreating] = useState(false);
  const busy = creating || Boolean(activatingProjectId);

  async function onCreate(event) {
    event.preventDefault();
    setCreating(true);
    try {
      await apiFetch("/projects", { method: "POST", body: { name } });
      setName("");
      addToast({ type: "success", message: "Проект создан" });
      await refreshProjects();
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка создания" });
    } finally {
      setCreating(false);
    }
  }

  async function onSelect(projectId) {
    try {
      await activateProject(projectId);
      addToast({ type: "success", message: "Активный проект обновлён" });
    } catch (error) {
      addToast({ type: "error", message: error?.message || "Ошибка выбора" });
    }
  }

  if (loading || !session || loadingProjects) {
    return (
      <PageShell title="Проекты" subtitle="Создание и выбор активного проекта для сессии">
        <PageLoadingSkeleton />
      </PageShell>
    );
  }

  return (
    <PageShell title="Проекты" subtitle="Создание и выбор активного проекта для сессии">
      <div className="space-y-4">
        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Новый проект</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 md:flex-row" onSubmit={onCreate}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название проекта"
                required
                minLength={2}
                maxLength={160}
              />
              <Button type="submit" disabled={busy}>
                Создать
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card data-motion-item>
          <CardHeader>
            <CardTitle>Список проектов</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Создан</TableHead>
                    <TableHead>Действие</TableHead>
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
                          loading={activatingProjectId === String(project.id)}
                          disabled={busy}
                          onClick={() => onSelect(project.id)}
                        >
                          {activeProjectId === project.id ? "Активен" : "Выбрать"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="Проектов пока нет"
                description="Создайте первый проект, чтобы начать работу с платформой."
              />
            )}
          </CardContent>
        </Card>

      </div>
    </PageShell>
  );
}
