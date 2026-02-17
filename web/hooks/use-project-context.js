"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

const initialState = {
  loading: false,
  error: "",
  projects: [],
  activeProjectId: null,
  activeProject: null,
};

export function useProjectContext(enabled = true) {
  const [state, setState] = useState({
    ...initialState,
    loading: Boolean(enabled),
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState(initialState);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await apiFetch("/projects");
      const projects = Array.isArray(data?.projects) ? data.projects : [];
      const activeProjectId = data?.active_project_id || null;
      const activeProject = projects.find((project) => project.id === activeProjectId) || null;
      setState({
        loading: false,
        error: "",
        projects,
        activeProjectId,
        activeProject,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Failed to load project context",
      }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState(initialState);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const handleProjectContextChanged = () => {
      void refresh();
    };
    window.addEventListener("project-context-changed", handleProjectContextChanged);
    return () => {
      window.removeEventListener("project-context-changed", handleProjectContextChanged);
    };
  }, [enabled, refresh]);

  return {
    ...state,
    refresh,
  };
}
