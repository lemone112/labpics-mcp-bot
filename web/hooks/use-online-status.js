"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const PROBE_INTERVAL_MS = 10_000;

/**
 * Detects online/offline state using navigator.onLine + health endpoint probe.
 * Returns { online: boolean } — false within ~5s of connectivity loss.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  const probeTimerRef = useRef(null);

  const probe = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) setOnline(true);
      else setOnline(false);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      probe();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic probe only when offline to detect reconnection
    probeTimerRef.current = setInterval(() => {
      if (!navigator.onLine) {
        setOnline(false);
      } else {
        probe();
      }
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(probeTimerRef.current);
    };
  }, [probe]);

  return { online };
}
