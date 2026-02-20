"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const TOAST_TIMEOUT_MS = 5000;
const MAX_VISIBLE = 5;

let toastId = 0;

const ToastContext = createContext(null);

/** Provides the toast stack. Wrap your app (or layout) with this. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = "info", message, duration = TOAST_TIMEOUT_MS }) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, type, message, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctx = { addToast, removeToast };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastStack toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/** Hook to push toasts from any component. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ── visual layer ──────────────────────────────────────────────── */

function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-4"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TONE = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-success/30 bg-success/10 text-success",
  info: "border-border bg-card text-foreground",
};

function ToastItem({ toast, onDismiss }) {
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-md",
        TONE[toast.type] || TONE.info
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="relative shrink-0 rounded-sm opacity-60 transition-opacity after:absolute after:-inset-2 after:content-[''] hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Закрыть"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
