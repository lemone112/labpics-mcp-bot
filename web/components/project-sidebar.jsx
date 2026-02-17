"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Loader2, LogOut } from "lucide-react";
import { useTheme } from "next-themes";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { projectDotClass } from "@/lib/project-colors";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProjectSidebarPanel({ open = true, onRequestClose = null }) {
  const router = useRouter();
  const [activatingId, setActivatingId] = useState("");
  const {
    projects,
    inPortfolio,
    currentSection,
    selectedProject,
    isAllProjects,
    canSelectAll,
    loadingProjects,
    error,
    projectIdSet,
    selectAllProjects,
    selectProject,
    refreshProjects,
  } = useProjectPortfolio();
  const { theme, setTheme } = useTheme();

  const selectedProjectId = useMemo(
    () => (isAllProjects ? null : selectedProject?.id ? String(selectedProject.id) : null),
    [isAllProjects, selectedProject]
  );

  async function onSetActiveProject(projectId) {
    const normalized = String(projectId || "").trim();
    if (!normalized || !projectIdSet.has(normalized)) return;
    setActivatingId(normalized);
    try {
      await apiFetch(`/projects/${normalized}/select`, { method: "POST" });
      selectProject(normalized);
      await refreshProjects();
      if (typeof onRequestClose === "function") {
        onRequestClose();
      }
    } finally {
      setActivatingId("");
    }
  }

  function onSelectAllProjects() {
    selectAllProjects();
    if (typeof onRequestClose === "function") {
      onRequestClose();
    }
  }

  async function onLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className={cn("flex h-full flex-col p-3", !open && "pointer-events-none")}>
        <div className="space-y-2 pb-3">
          <p className="text-sm font-semibold text-sidebar-foreground">Проекты</p>
          <p className="text-xs text-sidebar-foreground/70">Выбор: {isAllProjects ? "Все проекты" : selectedProject?.name || "-"}</p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={refreshProjects} disabled={loadingProjects}>
              Обновить
            </Button>
            {inPortfolio && canSelectAll ? (
              <Button type="button" size="sm" variant="outline" onClick={onSelectAllProjects} disabled={!projects.length || isAllProjects}>
                Все проекты
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {inPortfolio && canSelectAll ? (
            <button
              type="button"
              onClick={onSelectAllProjects}
              className={cn(
                "w-full rounded-md border p-2 text-left transition-colors",
                isAllProjects ? "border-sidebar-primary/60 bg-sidebar-accent/60" : "border-sidebar-border hover:bg-sidebar-accent/40"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-border bg-muted">
                  <Layers className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Все проекты</p>
                  <p className="text-xs text-sidebar-foreground/70">Агрегированный портфельный режим</p>
                </div>
              </div>
            </button>
          ) : null}

          {inPortfolio && currentSection === "messages" ? (
            <div className="rounded-md border px-3 py-2 text-xs text-sidebar-foreground/70">
              Для страницы «Переписки» доступен только выбор одного проекта.
            </div>
          ) : null}

          {loadingProjects ? (
            <div className="rounded-md border px-3 py-2 text-xs text-sidebar-foreground/70">Загрузка проектов...</div>
          ) : null}

          {!loadingProjects && error ? <div className="rounded-md border px-3 py-2 text-xs text-destructive">{error}</div> : null}

          {!loadingProjects &&
            projects.map((project) => {
              const projectId = String(project.id);
              const selected = selectedProjectId === projectId;
              const activating = activatingId === projectId;
              return (
                <button
                  key={projectId}
                  type="button"
                  onClick={() => onSetActiveProject(projectId)}
                  className={cn(
                    "w-full rounded-md border px-2 py-2 text-left transition-colors",
                    selected ? "border-sidebar-primary/60 bg-sidebar-accent/60" : "border-sidebar-border hover:bg-sidebar-accent/40"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", projectDotClass(projectId))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-sidebar-foreground">{project.name}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-sidebar-foreground/70">
                        {selected ? <span className="rounded border px-1.5 py-0.5">Выбран</span> : null}
                        {activating ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" />
                            Переключение
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

          {!loadingProjects && !projects.length ? (
            <div className="rounded-md border px-3 py-2 text-xs text-sidebar-foreground/70">Проекты ещё не созданы.</div>
          ) : null}
        </div>

        <div className="border-t pt-3">
          <div className="space-y-2">
            <p className="text-xs text-sidebar-foreground/70">Тема интерфейса</p>
            <Select value={theme || "system"} onValueChange={(value) => setTheme(value)}>
              <SelectTrigger aria-label="Выбрать тему">
                <SelectValue placeholder="Выбрать тему" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Светлая</SelectItem>
                <SelectItem value="dark">Тёмная</SelectItem>
                <SelectItem value="system">Системная</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-sidebar-foreground/70">По умолчанию используется системная тема.</p>

            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={onLogout}>
              <LogOut className="size-4" />
              Выйти
            </Button>
          </div>
        </div>
    </div>
  );
}

export function ProjectSidebar({ open = true }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 overflow-hidden border-r bg-sidebar transition-[width,opacity] duration-200 ease-linear md:block",
        open ? "w-[18.5rem] opacity-100" : "w-0 opacity-0"
      )}
    >
      <ProjectSidebarPanel open={open} />
    </aside>
  );
}
