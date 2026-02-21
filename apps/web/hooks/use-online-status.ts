"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const PROBE_INTERVAL_MS = 10_000;

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}

/**
 * Detects online/offline state using navigator.onLine + health endpoint probe.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  const probeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProbing = useCallback(() => {
    if (probeTimerRef.current) clearInterval(probeTimerRef.current);
    probeTimerRef.current = null;
  }, []);

  const probe = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/health`, {
        method: "GET",
        cache: "no-store",
        signal: createTimeoutSignal(5000),
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
    probeTimerRef.current = setInterval(() => {
      void probe();
    }, PROBE_INTERVAL_MS);
  }, [probe]);

  useEffect(() => {
    function handleOnline() {
      void probe();
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
