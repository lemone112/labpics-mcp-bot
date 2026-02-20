"use client";

import { useMemo } from "react";

import { useProjectPortfolio } from "@/hooks/use-project-portfolio";

export function useProjectGate() {
  const { selectedProjectIds, loadingProjects } = useProjectPortfolio();

  return useMemo(
    () => ({
      loadingProjects,
      hasProject: selectedProjectIds.length > 0,
      projectId: selectedProjectIds[0] || null,
    }),
    [loadingProjects, selectedProjectIds]
  );
}
