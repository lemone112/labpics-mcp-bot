"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { normalizeProjectId } from "@/hooks/use-portfolio-data";

function humanizeProjectError(rawError, fallbackMessage) {
  const message = String(rawError?.message || fallbackMessage || "").trim();
  if (!message) return "Не удалось обработать запрос по проектам";
  const normalized = message.toLowerCase();
  if (normalized === "internal_error") return "Временная ошибка сервера. Повторим автоматически.";
  if (normalized.includes("account_scope_mismatch")) return "Выбранные проекты относятся к разным рабочим областям.";
  if (normalized.includes("project_not_found")) return "Проект больше не доступен. Обновим список автоматически.";
  return message;
}

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
}) {
  const [activatingProjectId, setActivatingProjectId] = useState("");
  const [activationError, setActivationError] = useState("");
  const autoRepairAttemptRef = useRef("");

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

  // Auto-repair: if activeProjectId is invalid, activate the fallback
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
    activateProject(fallbackConcrete).catch(() => {});
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
