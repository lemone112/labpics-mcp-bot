"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { humanizeProjectError } from "@/lib/project-errors";
import { readStorageValue, writeStorageValue } from "@/lib/safe-storage";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

const STORAGE_SCOPE_KEY = "labpics:portfolio:selected-scope";
const STORAGE_LAST_PROJECT_KEY = "labpics:portfolio:last-concrete-project";
const ALL_PROJECTS_SCOPE = "__all_projects__";
const PROJECTS_AUTO_REFRESH_MS = 60_000;

type ProjectLike = {
  id: string | number;
  name?: string | null;
  [key: string]: unknown;
};

type RefreshProjectsOptions = {
  silent?: boolean;
};

type ProjectsResponse = {
  projects?: ProjectLike[];
  active_project_id?: string | null;
};

export function normalizeProjectId(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isLegacyScopeProject(project: ProjectLike): boolean {
  const name = String(project?.name || "").trim().toLowerCase();
  return name === "__legacy_scope__";
}

/**
 * usePortfolioData — data fetching, caching, and project list state.
 * Extracted from use-project-portfolio.js for maintainability.
 */
export function usePortfolioData({ canSelectAll }: { canSelectAll: boolean }) {
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [lastConcreteProjectId, setLastConcreteProjectId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");

  const projectIds = useMemo(() => projects.map((project) => String(project.id)), [projects]);
  const projectIdSet = useMemo(() => new Set(projectIds), [projectIds]);

  const ensureConcreteSelection = useCallback(
    (candidateId: unknown): string | null => {
      if (!projectIds.length) return null;
      const normalizedCandidate = normalizeProjectId(candidateId);
      if (normalizedCandidate && projectIdSet.has(normalizedCandidate)) {
        return normalizedCandidate;
      }
      const normalizedActive = normalizeProjectId(activeProjectId);
      if (normalizedActive && projectIdSet.has(normalizedActive)) {
        return normalizedActive;
      }
      return projectIds[0];
    },
    [projectIdSet, projectIds, activeProjectId]
  );

  const refreshProjects = useCallback(async (options: RefreshProjectsOptions = {}): Promise<void> => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoadingProjects(true);
      setError("");
    }
    try {
      const data = (await apiFetch("/projects")) as ProjectsResponse;
      const sourceProjects = Array.isArray(data?.projects) ? data.projects : [];
      const nextProjects = sourceProjects.filter((project) => !isLegacyScopeProject(project));
      const nextProjectIds = nextProjects.map((project) => String(project.id));
      const nextProjectIdSet = new Set(nextProjectIds);
      const nextActiveProjectId = normalizeProjectId(data?.active_project_id);
      setProjects(nextProjects);
      setActiveProjectId(nextActiveProjectId);
      setError("");

      const fallbackConcrete =
        (nextActiveProjectId && nextProjectIdSet.has(nextActiveProjectId) ? nextActiveProjectId : null) || nextProjectIds[0] || null;
      const storedScope = normalizeProjectId(readStorageValue(STORAGE_SCOPE_KEY, null));
      const storedLast = normalizeProjectId(readStorageValue(STORAGE_LAST_PROJECT_KEY, null));
      const nextLastConcrete = storedLast && nextProjectIdSet.has(storedLast) ? storedLast : fallbackConcrete;

      let nextScope = fallbackConcrete;
      if (storedScope === ALL_PROJECTS_SCOPE && canSelectAll) {
        nextScope = ALL_PROJECTS_SCOPE;
      } else if (storedScope && nextProjectIdSet.has(storedScope)) {
        nextScope = storedScope;
      }
      if (!nextScope && nextProjectIds.length) {
        nextScope = nextLastConcrete || nextProjectIds[0];
      }

      setLastConcreteProjectId(nextLastConcrete);
      setSelectedScopeId(nextScope);
    } catch (requestError) {
      const message = humanizeProjectError(requestError, "Не удалось загрузить список проектов");
      if (!silent) {
        setError(message);
      }
      if (!silent) {
        setProjects([]);
        setSelectedScopeId(null);
        setLastConcreteProjectId(null);
        setActiveProjectId(null);
      }
    } finally {
      if (!silent) {
        setLoadingProjects(false);
      }
    }
  }, [canSelectAll]);

  // Initial fetch
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Auto-refresh on focus / visibility / interval
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refreshSilently = () => {
      if (document.visibilityState !== "visible") return;
      refreshProjects({ silent: true }).catch(() => {});
    };
    const intervalId = window.setInterval(refreshSilently, PROJECTS_AUTO_REFRESH_MS);
    const onFocus = () => refreshSilently();
    const onVisibilityChange = () => refreshSilently();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshProjects]);

  // Persist scope to localStorage
  useEffect(() => {
    if (selectedScopeId) {
      writeStorageValue(STORAGE_SCOPE_KEY, selectedScopeId);
    }
  }, [selectedScopeId]);

  // Persist last concrete project to localStorage
  useEffect(() => {
    if (lastConcreteProjectId) {
      writeStorageValue(STORAGE_LAST_PROJECT_KEY, lastConcreteProjectId);
    }
  }, [lastConcreteProjectId]);

  const autoRefresh = useAutoRefresh(refreshProjects, 60_000, { enabled: !loadingProjects });

  return {
    projects,
    projectIds,
    projectIdSet,
    selectedScopeId,
    setSelectedScopeId,
    lastConcreteProjectId,
    setLastConcreteProjectId,
    activeProjectId,
    setActiveProjectId,
    loadingProjects,
    error,
    ensureConcreteSelection,
    refreshProjects,
    autoRefresh,
  };
}

export { ALL_PROJECTS_SCOPE };
