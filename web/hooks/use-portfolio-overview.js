"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

function normalizeProjectIds(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}

export function usePortfolioOverview({ projectIds, enabled = true, messageLimit = 60, cardLimit = 24 }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ids = useMemo(() => normalizeProjectIds(projectIds), [projectIds]);
  const idsParam = useMemo(() => ids.join(","), [ids]);

  const reload = useCallback(async () => {
    if (!enabled || !ids.length) {
      setPayload(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(
        `/portfolio/overview?project_ids=${encodeURIComponent(idsParam)}&message_limit=${messageLimit}&card_limit=${cardLimit}`
      );
      setPayload(data);
    } catch (requestError) {
      setError(requestError?.message || "Не удалось загрузить портфельные данные");
    } finally {
      setLoading(false);
    }
  }, [enabled, ids.length, idsParam, messageLimit, cardLimit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { payload, loading, error, reload };
}
