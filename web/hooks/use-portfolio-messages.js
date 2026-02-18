"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

export function usePortfolioMessages({ projectId, contactGlobalId, enabled = true, limit = 250, sseConnected = false }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedProjectId = useMemo(() => String(projectId || "").trim(), [projectId]);
  const normalizedContactId = useMemo(() => String(contactGlobalId || "").trim(), [contactGlobalId]);

  const reload = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent);
    if (!enabled || !normalizedProjectId) {
      setPayload(null);
      setError("");
      return;
    }

    if (!silent) {
      setLoading(true);
    }
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [enabled, normalizedProjectId, normalizedContactId, limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  const autoRefresh = useAutoRefresh(reload, 20_000, { enabled, sseConnected });

  return { payload, loading, error, reload, autoRefresh };
}
