"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "labpics:portfolio:selected-projects";

const ProjectPortfolioContext = createContext(null);

function normalizeIds(input) {
  if (!Array.isArray(input)) return [];
  const deduped = new Set();
  for (const item of input) {
    const normalized = String(item || "").trim();
    if (!normalized) continue;
    deduped.add(normalized);
    if (deduped.size >= 100) break;
  }
  return Array.from(deduped);
}

export function ProjectPortfolioProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError("");
    try {
      const data = await apiFetch("/projects");
      const nextProjects = Array.isArray(data?.projects) ? data.projects : [];
      const nextActiveProjectId = data?.active_project_id ? String(data.active_project_id) : null;
      setProjects(nextProjects);
      setActiveProjectId(nextActiveProjectId);

      const availableIds = new Set(nextProjects.map((project) => String(project.id)));
      let restored = [];
      if (typeof window !== "undefined") {
        try {
          const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
          restored = normalizeIds(stored).filter((id) => availableIds.has(id));
        } catch {
          restored = [];
        }
      }

      const fallbackId = nextActiveProjectId && availableIds.has(nextActiveProjectId) ? nextActiveProjectId : nextProjects[0]?.id || null;
      const nextSelection = restored.length ? restored : fallbackId ? [String(fallbackId)] : [];
      setSelectedProjectIds(nextSelection);
    } catch (requestError) {
      setError(requestError?.message || "Не удалось загрузить список проектов");
      setProjects([]);
      setSelectedProjectIds([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProjectIds));
  }, [selectedProjectIds]);

  const toggleProjectSelection = useCallback((projectId) => {
    const normalized = String(projectId || "").trim();
    if (!normalized) return;
    setSelectedProjectIds((prev) => {
      if (prev.includes(normalized)) {
        return prev.filter((id) => id !== normalized);
      }
      return [...prev, normalized];
    });
  }, []);

  const selectSingleProject = useCallback((projectId) => {
    const normalized = String(projectId || "").trim();
    if (!normalized) return;
    setSelectedProjectIds([normalized]);
  }, []);

  const selectAllProjects = useCallback(() => {
    setSelectedProjectIds(projects.map((project) => String(project.id)));
  }, [projects]);

  const clearSelection = useCallback(() => {
    setSelectedProjectIds([]);
  }, []);

  const selectedProjects = useMemo(() => {
    const selected = new Set(selectedProjectIds);
    return projects.filter((project) => selected.has(String(project.id)));
  }, [projects, selectedProjectIds]);

  const contextValue = useMemo(
    () => ({
      projects,
      selectedProjectIds,
      selectedProjects,
      activeProjectId,
      loadingProjects,
      error,
      refreshProjects,
      toggleProjectSelection,
      selectSingleProject,
      selectAllProjects,
      clearSelection,
      setSelectedProjectIds,
    }),
    [
      projects,
      selectedProjectIds,
      selectedProjects,
      activeProjectId,
      loadingProjects,
      error,
      refreshProjects,
      toggleProjectSelection,
      selectSingleProject,
      selectAllProjects,
      clearSelection,
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
