"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const PROBE_INTERVAL_MS = 10_000;

/**
 * Detects online/offline state using navigator.onLine + health endpoint probe.
 * Only probes the server when recovering from offline state to avoid
 * unnecessary traffic (no polling while already online).
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  const probeTimerRef = useRef(null);

  const stopProbing = useCallback(() => {
    clearInterval(probeTimerRef.current);
    probeTimerRef.current = null;
  }, []);

  const probe = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        setOnline(true);
        stopProbing();
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    }
  }, [stopProbing]);

  const startProbing = useCallback(() => {
    if (probeTimerRef.current) return;
    probeTimerRef.current = setInterval(probe, PROBE_INTERVAL_MS);
  }, [probe]);

  useEffect(() => {
    function handleOnline() {
      probe();
    }
    function handleOffline() {
      setOnline(false);
      startProbing();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setOnline(false);
      startProbing();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      stopProbing();
    };
  }, [probe, startProbing, stopProbing]);

  return { online };
}
