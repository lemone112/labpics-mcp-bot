"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { normalizeProjectIds } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

export function usePortfolioOverview({ projectIds, enabled = true, messageLimit = 60, cardLimit = 24, sseConnected = false }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ids = useMemo(() => normalizeProjectIds(projectIds), [projectIds]);
  const idsParam = useMemo(() => ids.join(","), [ids]);

  const reload = useCallback(async (options = {}) => {
    const silent = Boolean(options?.silent);
    if (!enabled || !ids.length) {
      setPayload(null);
      setError("");
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setError("");
    try {
      const data = await apiFetch(
        `/portfolio/overview?project_ids=${encodeURIComponent(idsParam)}&message_limit=${messageLimit}&card_limit=${cardLimit}`
      );
      setPayload(data);
    } catch (requestError) {
      setError(requestError?.message || "Не удалось загрузить портфельные данные");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [enabled, ids.length, idsParam, messageLimit, cardLimit]);

  useEffect(() => {
    reload();
  }, [reload]);

  const autoRefresh = useAutoRefresh(reload, 30_000, { enabled, sseConnected });

  return { payload, loading, error, reload, autoRefresh };
}
