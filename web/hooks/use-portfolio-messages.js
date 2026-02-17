"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

export function usePortfolioMessages({ projectId, contactGlobalId, enabled = true, limit = 250 }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedProjectId = useMemo(() => String(projectId || "").trim(), [projectId]);
  const normalizedContactId = useMemo(() => String(contactGlobalId || "").trim(), [contactGlobalId]);

  const reload = useCallback(async () => {
    if (!enabled || !normalizedProjectId) {
      setPayload(null);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        project_id: normalizedProjectId,
        limit: String(limit),
      });
      if (normalizedContactId) {
        query.set("contact_global_id", normalizedContactId);
      }

      const data = await apiFetch(`/portfolio/messages?${query.toString()}`);
      setPayload(data);
    } catch (requestError) {
      setError(requestError?.message || "Не удалось загрузить переписки");
    } finally {
      setLoading(false);
    }
  }, [enabled, normalizedProjectId, normalizedContactId, limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { payload, loading, error, reload };
}
