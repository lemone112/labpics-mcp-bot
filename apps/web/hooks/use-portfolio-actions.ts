"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { humanizeProjectError } from "@/lib/project-errors";
import { normalizeProjectId } from "@/hooks/use-portfolio-data";

type UsePortfolioActionsParams = {
  projectIds: string[];
  projectIdSet: Set<string>;
  activeProjectId: string | null;
  setActiveProjectId: (value: string | null) => void;
  setSelectedScopeId: (value: string | null) => void;
  setLastConcreteProjectId: (value: string | null) => void;
  lastConcreteProjectId: string | null;
  ensureConcreteSelection: (candidateId: unknown) => string | null;
  canSelectAll: boolean;
};

/**
 * usePortfolioActions — mutation functions (activate project, select all).
 * Extracted from use-project-portfolio.js for maintainability.
 */
export function usePortfolioActions({
  projectIds,
  projectIdSet,
  activeProjectId,
  setActiveProjectId,
  setSelectedScopeId,
  setLastConcreteProjectId,
  lastConcreteProjectId,
  ensureConcreteSelection,
  canSelectAll,
}: UsePortfolioActionsParams) {
  const [activatingProjectId, setActivatingProjectId] = useState("");
  const [activationError, setActivationError] = useState("");
  const autoRepairAttemptRef = useRef("");

  const activateProject = useCallback(
    async (projectId: unknown): Promise<void> => {
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
        const message = humanizeProjectError(requestError, "Не удалось переключить проект");
        setActivationError(message);
        throw requestError;
      } finally {
        setActivatingProjectId("");
      }
    },
    [projectIdSet, activeProjectId, setActiveProjectId, setSelectedScopeId, setLastConcreteProjectId]
  );

  const selectAllProjects = useCallback(() => {
    if (!canSelectAll || !projectIds.length) return;
    setActivationError("");
    setSelectedScopeId("__all_projects__");
  }, [canSelectAll, projectIds.length, setSelectedScopeId]);

  // Auto-repair: if activeProjectId is invalid, activate the fallback.
  useEffect(() => {
    if (!projectIds.length) return;
    if (activatingProjectId) return;

    const normalizedActive = normalizeProjectId(activeProjectId);
    if (normalizedActive && projectIdSet.has(normalizedActive)) return;

    const fallbackConcrete = ensureConcreteSelection(lastConcreteProjectId);
    if (!fallbackConcrete) return;

    const repairKey = `${normalizedActive || "none"}->${fallbackConcrete}|${projectIds.join(",")}`;
    if (autoRepairAttemptRef.current === repairKey) return;
    autoRepairAttemptRef.current = repairKey;

    activateProject(fallbackConcrete).catch((error) => {
      // Keep UI resilient: auto-repair is best-effort and should not hard-crash.
      console.warn("[portfolio] auto-repair activateProject failed", {
        from: normalizedActive,
        to: fallbackConcrete,
        error: String((error as Error)?.message || error),
      });
    });
  }, [
    projectIds,
    projectIdSet,
    activeProjectId,
    activatingProjectId,
    ensureConcreteSelection,
    lastConcreteProjectId,
    activateProject,
  ]);

  return {
    activatingProjectId,
    activationError,
    activateProject,
    selectAllProjects,
  };
}
