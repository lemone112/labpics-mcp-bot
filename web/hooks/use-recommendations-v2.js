"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

function normalizeProjectIds(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}

export function useRecommendationsV2({
  projectIds = [],
  enabled = true,
  allProjects = false,
  status = "",
  limit = 100,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const ids = useMemo(() => normalizeProjectIds(projectIds), [projectIds]);
  const shouldLoad = enabled && (allProjects || ids.length > 0);

  const reload = useCallback(async () => {
    if (!shouldLoad) {
      setItems([]);
      setError("");
      return [];
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        limit: String(limit),
      });
      if (status) query.set("status", status);
      if (allProjects) query.set("all_projects", "true");

      const data = await apiFetch(`/kag/v2/recommendations?${query.toString()}`);
      const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
      setItems(recommendations);

      const shownIds = recommendations.map((item) => item.id).filter(Boolean);
      if (shownIds.length) {
        await apiFetch("/kag/v2/recommendations/shown", {
          method: "POST",
          body: {
            recommendation_ids: shownIds,
            all_projects: allProjects,
          },
        });
      }
      return recommendations;
    } catch (requestError) {
      setError(requestError?.message || "Не удалось загрузить рекомендации");
      return [];
    } finally {
      setLoading(false);
    }
  }, [shouldLoad, limit, status, allProjects]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateStatus = useCallback(
    async (recommendationId, nextStatus) => {
      if (!recommendationId) return null;
      const data = await apiFetch(`/kag/v2/recommendations/${encodeURIComponent(recommendationId)}/status`, {
        method: "POST",
        body: { status: nextStatus, all_projects: allProjects },
      });
      await reload();
      return data?.recommendation || null;
    },
    [allProjects, reload]
  );

  const sendFeedback = useCallback(
    async (recommendationId, helpful, note = "") => {
      if (!recommendationId) return null;
      const data = await apiFetch(`/kag/v2/recommendations/${encodeURIComponent(recommendationId)}/feedback`, {
        method: "POST",
        body: { helpful, note, all_projects: allProjects },
      });
      await reload();
      return data?.recommendation || null;
    },
    [allProjects, reload]
  );

  const runAction = useCallback(
    async (recommendationId, actionType, actionPayload = {}) => {
      if (!recommendationId) return null;
      return apiFetch(`/kag/v2/recommendations/${encodeURIComponent(recommendationId)}/actions`, {
        method: "POST",
        body: {
          action_type: actionType,
          action_payload: actionPayload,
          all_projects: allProjects,
        },
      });
    },
    [allProjects]
  );

  const listActions = useCallback(
    async (recommendationId, nextLimit = 30) => {
      if (!recommendationId) return [];
      const query = new URLSearchParams({
        limit: String(nextLimit),
      });
      if (allProjects) query.set("all_projects", "true");
      const data = await apiFetch(`/kag/v2/recommendations/${encodeURIComponent(recommendationId)}/actions?${query.toString()}`);
      return Array.isArray(data?.actions) ? data.actions : [];
    },
    [allProjects]
  );

  const retryAction = useCallback(
    async (actionId) => {
      if (!actionId) return null;
      return apiFetch(`/kag/v2/recommendations/actions/${encodeURIComponent(actionId)}/retry`, {
        method: "POST",
        body: { all_projects: allProjects },
      });
    },
    [allProjects]
  );

  return {
    items,
    loading,
    error,
    reload,
    updateStatus,
    sendFeedback,
    runAction,
    listActions,
    retryAction,
  };
}
