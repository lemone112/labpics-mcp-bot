"use client";

import { useMemo, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";

import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useProjectPortfolio } from "@/hooks/use-project-portfolio";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProjectSidebar({ open = true }) {
  const [activatingId, setActivatingId] = useState("");
  const [updatingSelection, setUpdatingSelection] = useState(false);
  const {
    projects,
    selectedProjectIds,
    loadingProjects,
    error,
    activeProjectId,
    toggleProjectSelection,
    selectAllProjects,
    clearSelection,
    refreshProjects,
  } = useProjectPortfolio();
  const { theme, setTheme } = useTheme();

  const selectedLookup = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);

  async function onSetActiveProject(projectId) {
    const normalized = String(projectId || "").trim();
    if (!normalized) return;
    setActivatingId(normalized);
    try {
      await apiFetch(`/projects/${normalized}/select`, { method: "POST" });
      await refreshProjects();
    } finally {
      setActivatingId("");
    }
  }

  async function onToggleProject(projectId) {
    setUpdatingSelection(true);
    try {
      toggleProjectSelection(projectId);
    } finally {
      setTimeout(() => setUpdatingSelection(false), 0);
    }
  }

  return (
    <aside
      className={cn(
        "min-h-svh shrink-0 overflow-hidden border-r bg-sidebar transition-[width,opacity] duration-200 ease-linear",
        open ? "w-[18.5rem] opacity-100" : "w-0 opacity-0"
      )}
    >
      <div className={cn("flex h-full min-h-svh flex-col p-3", !open && "pointer-events-none")}>
        <div className="space-y-2 pb-3">
          <p className="text-sm font-semibold text-sidebar-foreground">Проекты</p>
          <p className="text-xs text-sidebar-foreground/70">
            Выбрано: {selectedProjectIds.length} из {projects.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAllProjects} disabled={!projects.length}>
              Все
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearSelection} disabled={!selectedProjectIds.length}>
              Очистить
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={refreshProjects} disabled={loadingProjects}>
              Обновить
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {loadingProjects ? (
            <div className="rounded-md border px-3 py-2 text-xs text-sidebar-foreground/70">Загрузка проектов...</div>
          ) : null}

          {!loadingProjects && error ? <div className="rounded-md border px-3 py-2 text-xs text-destructive">{error}</div> : null}

          {!loadingProjects &&
            projects.map((project) => {
              const projectId = String(project.id);
              const selected = selectedLookup.has(projectId);
              const isActive = activeProjectId && projectId === String(activeProjectId);
              const activating = activatingId === projectId;
              return (
                <div
                  key={projectId}
                  className={cn(
                    "rounded-md border px-2 py-2",
                    selected ? "border-sidebar-primary/50 bg-sidebar-accent/50" : "border-sidebar-border"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleProject(projectId)}
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-sidebar-foreground",
                        selected ? "border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground" : "border-sidebar-border"
                      )}
                      aria-label={selected ? `Убрать ${project.name} из выборки` : `Добавить ${project.name} в выборку`}
                    >
                      {selected ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onSetActiveProject(projectId)}
                        className="w-full truncate text-left text-sm text-sidebar-foreground hover:text-sidebar-accent-foreground"
                      >
                        {project.name}
                      </button>
                      <div className="mt-1 flex items-center gap-2 text-xs text-sidebar-foreground/70">
                        {isActive ? <span className="rounded border px-1.5 py-0.5">Активный</span> : null}
                        {activating ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" />
                            Переключение
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
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
          </div>
        </div>
      </div>

      {updatingSelection ? <span className="sr-only">Обновление выборки проектов</span> : null}
    </aside>
  );
}
