"use client";

import { useEffect, useMemo } from "react";

import { ALL_PROJECTS_SCOPE, normalizeProjectId } from "@/hooks/use-portfolio-data";

/**
 * usePortfolioFilters — filter/sort state and derived selections.
 * Extracted from use-project-portfolio.js for maintainability.
 */
export function usePortfolioFilters({
  projects,
  projectIds,
  projectIdSet,
  selectedScopeId,
  setSelectedScopeId,
  lastConcreteProjectId,
  setLastConcreteProjectId,
  canSelectAll,
  ensureConcreteSelection,
}) {
  // Reconcile selection when project list changes
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
  }, [projectIds, projectIdSet, selectedScopeId, canSelectAll, lastConcreteProjectId, ensureConcreteSelection, setSelectedScopeId, setLastConcreteProjectId]);

  const isAllProjects = selectedScopeId === ALL_PROJECTS_SCOPE && canSelectAll;

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

  const selectedProjects = useMemo(() => {
    if (isAllProjects) return projects;
    const selectedId = selectedProjectIds[0];
    return selectedId ? projects.filter((project) => String(project.id) === selectedId) : [];
  }, [projects, selectedProjectIds, isAllProjects]);

  const selectedProject = selectedProjects[0] || null;

  return {
    isAllProjects,
    selectedProjectIds,
    selectedProjects,
    selectedProject,
  };
}
