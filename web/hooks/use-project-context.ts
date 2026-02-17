"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getProjects } from "@/lib/api";
import type { Project } from "@/lib/types";

interface ProjectContextState {
  loading: boolean;
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectContext(enabled = true): ProjectContextState {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProjects();
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
      setActiveProjectId(data?.active_project_id || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  return { loading, projects, activeProjectId, activeProject, error, refresh };
}
