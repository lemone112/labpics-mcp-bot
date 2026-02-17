"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { parsePortfolioSectionFromPath, sectionAllowsAllProjects } from "@/lib/portfolio-sections";

const STORAGE_SCOPE_KEY = "labpics:portfolio:selected-scope";
const STORAGE_LAST_PROJECT_KEY = "labpics:portfolio:last-concrete-project";
const ALL_PROJECTS_SCOPE = "__all_projects__";

const ProjectPortfolioContext = createContext(null);

function normalizeProjectId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function readStorageValue(key, fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function ProjectPortfolioProvider({ children }) {
  const pathname = usePathname();
  const currentSection = parsePortfolioSectionFromPath(pathname);
  const inPortfolio = String(pathname || "").startsWith("/control-tower");
  const canSelectAll = inPortfolio && sectionAllowsAllProjects(currentSection);

  const [projects, setProjects] = useState([]);
  const [selectedScopeId, setSelectedScopeId] = useState(null);
  const [lastConcreteProjectId, setLastConcreteProjectId] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activatingProjectId, setActivatingProjectId] = useState("");
  const [activationError, setActivationError] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");

  const projectIds = useMemo(() => projects.map((project) => String(project.id)), [projects]);
  const projectIdSet = useMemo(() => new Set(projectIds), [projectIds]);

  const ensureConcreteSelection = useCallback(
    (candidateId) => {
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

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError("");
    setActivationError("");
    try {
      const data = await apiFetch("/projects");
      const nextProjects = Array.isArray(data?.projects) ? data.projects : [];
      const nextProjectIds = nextProjects.map((project) => String(project.id));
      const nextProjectIdSet = new Set(nextProjectIds);
      const nextActiveProjectId = normalizeProjectId(data?.active_project_id);
      setProjects(nextProjects);
      setActiveProjectId(nextActiveProjectId);

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
      setError(requestError?.message || "Не удалось загрузить список проектов");
      setProjects([]);
      setSelectedScopeId(null);
      setLastConcreteProjectId(null);
      setActiveProjectId(null);
    } finally {
      setLoadingProjects(false);
    }
  }, [canSelectAll]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedScopeId) {
      window.localStorage.setItem(STORAGE_SCOPE_KEY, selectedScopeId);
    }
  }, [selectedScopeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastConcreteProjectId) {
      window.localStorage.setItem(STORAGE_LAST_PROJECT_KEY, lastConcreteProjectId);
    }
  }, [lastConcreteProjectId]);

  useEffect(() => {
    if (!projectIds.length) return;

    const fallbackConcrete = ensureConcreteSelection(lastConcreteProjectId);
    const selected = normalizeProjectId(selectedScopeId);

    if (!selected) {
      setSelectedScopeId(fallbackConcrete);
      return;
    }

    if (selected === ALL_PROJECTS_SCOPE) {
      if (!canSelectAll) {
        setSelectedScopeId(fallbackConcrete);
      }
      return;
    }

    if (!projectIdSet.has(selected)) {
      setSelectedScopeId(fallbackConcrete);
      return;
    }

    if (lastConcreteProjectId !== selected) {
      setLastConcreteProjectId(selected);
    }
  }, [projectIds, projectIdSet, selectedScopeId, canSelectAll, lastConcreteProjectId, ensureConcreteSelection]);

  const activateProject = useCallback(
    async (projectId) => {
      const normalized = normalizeProjectId(projectId);
      if (!normalized || !projectIdSet.has(normalized)) {
        throw new Error("Проект недоступен для выбора");
      }
      setActivationError("");
      setActivatingProjectId(normalized);
      try {
        if (normalizeProjectId(activeProjectId) !== normalized) {
          await apiFetch(`/projects/${normalized}/select`, { method: "POST" });
        }
        setActiveProjectId(normalized);
        setSelectedScopeId(normalized);
        setLastConcreteProjectId(normalized);
      } catch (requestError) {
        const message = requestError?.message || "Не удалось переключить проект";
        setActivationError(message);
        throw requestError;
      } finally {
        setActivatingProjectId("");
      }
    },
    [projectIdSet, activeProjectId]
  );

  const selectAllProjects = useCallback(() => {
    if (!canSelectAll || !projectIds.length) return;
    setActivationError("");
    setSelectedScopeId(ALL_PROJECTS_SCOPE);
  }, [canSelectAll, projectIds.length]);

  const selectedProjectIds = useMemo(() => {
    if (!projectIds.length) return [];
    if (selectedScopeId === ALL_PROJECTS_SCOPE && canSelectAll) {
      return projectIds;
    }
    const concrete =
      selectedScopeId === ALL_PROJECTS_SCOPE
        ? ensureConcreteSelection(lastConcreteProjectId)
        : normalizeProjectId(selectedScopeId) || ensureConcreteSelection(lastConcreteProjectId);
    return concrete ? [concrete] : [];
  }, [selectedScopeId, canSelectAll, projectIds, ensureConcreteSelection, lastConcreteProjectId]);

  const isAllProjects = selectedScopeId === ALL_PROJECTS_SCOPE && canSelectAll;

  const selectedProjects = useMemo(() => {
    if (isAllProjects) return projects;
    const selectedId = selectedProjectIds[0];
    return selectedId ? projects.filter((project) => String(project.id) === selectedId) : [];
  }, [projects, selectedProjectIds, isAllProjects]);

  const selectedProject = selectedProjects[0] || null;

  const contextValue = useMemo(
    () => ({
      projects,
      projectIds,
      projectIdSet,
      inPortfolio,
      currentSection,
      canSelectAll,
      isAllProjects,
      selectedScopeId,
      selectedProjectIds,
      selectedProjects,
      selectedProject,
      lastConcreteProjectId,
      activeProjectId,
      activatingProjectId,
      activationError,
      loadingProjects,
      error,
      refreshProjects,
      activateProject,
      selectAllProjects,
    }),
    [
      projects,
      projectIds,
      projectIdSet,
      inPortfolio,
      currentSection,
      canSelectAll,
      isAllProjects,
      selectedScopeId,
      selectedProjectIds,
      selectedProjects,
      selectedProject,
      lastConcreteProjectId,
      activeProjectId,
      activatingProjectId,
      activationError,
      loadingProjects,
      error,
      refreshProjects,
      activateProject,
      selectAllProjects,
    ]
  );

  return <ProjectPortfolioContext.Provider value={contextValue}>{children}</ProjectPortfolioContext.Provider>;
}

export function useProjectPortfolio() {
  const context = useContext(ProjectPortfolioContext);
  if (!context) {
    throw new Error("useProjectPortfolio must be used within ProjectPortfolioProvider");
  }
  return context;
}
