"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";

import { parsePortfolioSectionFromPath, sectionAllowsAllProjects } from "@/lib/portfolio-sections";
import { usePortfolioData } from "@/hooks/use-portfolio-data";
import { usePortfolioActions } from "@/hooks/use-portfolio-actions";
import { usePortfolioFilters } from "@/hooks/use-portfolio-filters";

const ProjectPortfolioContext = createContext(null);

export function ProjectPortfolioProvider({ children }) {
  const pathname = usePathname();
  const currentSection = parsePortfolioSectionFromPath(pathname);
  const inPortfolio = String(pathname || "").startsWith("/control-tower");
  const canSelectAll = inPortfolio && sectionAllowsAllProjects(currentSection);

  const data = usePortfolioData({ canSelectAll });

  const actions = usePortfolioActions({
    projectIds: data.projectIds,
    projectIdSet: data.projectIdSet,
    activeProjectId: data.activeProjectId,
    setActiveProjectId: data.setActiveProjectId,
    setSelectedScopeId: data.setSelectedScopeId,
    setLastConcreteProjectId: data.setLastConcreteProjectId,
    lastConcreteProjectId: data.lastConcreteProjectId,
    ensureConcreteSelection: data.ensureConcreteSelection,
    canSelectAll,
  });

  const filters = usePortfolioFilters({
    projects: data.projects,
    projectIds: data.projectIds,
    projectIdSet: data.projectIdSet,
    selectedScopeId: data.selectedScopeId,
    setSelectedScopeId: data.setSelectedScopeId,
    lastConcreteProjectId: data.lastConcreteProjectId,
    setLastConcreteProjectId: data.setLastConcreteProjectId,
    canSelectAll,
    ensureConcreteSelection: data.ensureConcreteSelection,
  });

  const contextValue = useMemo(
    () => ({
      projects: data.projects,
      projectIds: data.projectIds,
      projectIdSet: data.projectIdSet,
      inPortfolio,
      currentSection,
      canSelectAll,
      isAllProjects: filters.isAllProjects,
      selectedScopeId: data.selectedScopeId,
      selectedProjectIds: filters.selectedProjectIds,
      selectedProjects: filters.selectedProjects,
      selectedProject: filters.selectedProject,
      lastConcreteProjectId: data.lastConcreteProjectId,
      activeProjectId: data.activeProjectId,
      activatingProjectId: actions.activatingProjectId,
      activationError: actions.activationError,
      loadingProjects: data.loadingProjects,
      error: data.error,
      refreshProjects: data.refreshProjects,
      autoRefresh: data.autoRefresh,
      activateProject: actions.activateProject,
      selectAllProjects: actions.selectAllProjects,
    }),
    [
      data.projects,
      data.projectIds,
      data.projectIdSet,
      inPortfolio,
      currentSection,
      canSelectAll,
      filters.isAllProjects,
      data.selectedScopeId,
      filters.selectedProjectIds,
      filters.selectedProjects,
      filters.selectedProject,
      data.lastConcreteProjectId,
      data.activeProjectId,
      actions.activatingProjectId,
      actions.activationError,
      data.loadingProjects,
      data.error,
      data.refreshProjects,
      data.autoRefresh,
      actions.activateProject,
      actions.selectAllProjects,
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
