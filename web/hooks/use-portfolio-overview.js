"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

const PORTFOLIO_OVERVIEW_AUTO_REFRESH_MS = 45_000;

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!enabled || !ids.length) return undefined;
    const refreshSilently = () => {
      if (document.visibilityState !== "visible") return;
      reload({ silent: true }).catch(() => {});
    };
    const intervalId = window.setInterval(refreshSilently, PORTFOLIO_OVERVIEW_AUTO_REFRESH_MS);
    const onFocus = () => refreshSilently();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, ids.length, reload]);

  return { payload, loading, error, reload };
}
