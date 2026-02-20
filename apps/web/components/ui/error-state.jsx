"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw, LogIn, Home, HelpCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { classifyError, getRecoveryActionLabel, getRecoveryActionHref } from "@/lib/error-classification";

// ── Recovery Action Icons ──────────────────────────────────────

const ACTION_ICONS = {
  retry: RefreshCw,
  refresh: RefreshCw,
  login: LogIn,
  navigate: Home,
  contact: HelpCircle,
  dismiss: X,
};

// ── Severity Styles ────────────────────────────────────────────

const SEVERITY_STYLES = {
  info: {
    border: "border-primary/20",
    bg: "bg-primary/5",
    icon: "text-primary",
  },
  warning: {
    border: "border-warning/20",
    bg: "bg-warning/5",
    icon: "text-warning",
  },
  error: {
    border: "border-destructive/20",
    bg: "bg-destructive/5",
    icon: "text-destructive",
  },
  critical: {
    border: "border-destructive/40",
    bg: "bg-destructive/10",
    icon: "text-destructive",
  },
};

// ── Inline Error State ─────────────────────────────────────────

/**
 * InlineError — compact error display for section/component-level errors.
 * Shows error message with retry button and optional auto-retry countdown.
 *
 * @param {{
 *   error: Error | import("@/types/error-recovery").ErrorState | null,
 *   onRetry?: () => void,
 *   onDismiss?: () => void,
 *   className?: string,
 *   compact?: boolean,
 * }} props
 */
export function InlineError({ error, onRetry, onDismiss, className, compact = false }) {
  const [retrying, setRetrying] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const autoRetryTimerRef = useRef(null);

  // Classify raw errors
  const errorState = error && !error.category ? classifyError(error) : error;

  // Auto-retry logic
  useEffect(() => {
    if (!errorState?.autoRetry || !onRetry || autoRetryCount >= 3) return;

    const delay = errorState.autoRetryDelayMs * Math.pow(2, autoRetryCount);

    autoRetryTimerRef.current = setTimeout(async () => {
      setAutoRetryCount((c) => c + 1);
      setRetrying(true);
      try {
        await onRetry();
      } finally {
        setRetrying(false);
      }
    }, delay);

    return () => clearTimeout(autoRetryTimerRef.current);
  }, [errorState, onRetry, autoRetryCount]);

  // Cleanup
  useEffect(() => {
    return () => clearTimeout(autoRetryTimerRef.current);
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setAutoRetryCount(0);
    clearTimeout(autoRetryTimerRef.current);
    try {
      await onRetry?.();
    } finally {
      setRetrying(false);
    }
  }, [onRetry]);

  if (!errorState) return null;

  const severity = SEVERITY_STYLES[errorState.severity] || SEVERITY_STYLES.error;

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
          severity.border,
          severity.bg,
          className,
        )}
      >
        <AlertCircle className={cn("size-4 shrink-0", severity.icon)} />
        <span className="flex-1 text-foreground">{errorState.title}</span>
        {onRetry ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleRetry}
            loading={retrying}
          >
            Повторить
          </Button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={onDismiss}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-6 py-8 text-center",
        severity.border,
        severity.bg,
        className,
      )}
    >
      <AlertCircle className={cn("mx-auto size-8", severity.icon)} />
      <h3 className="mt-3 text-sm font-semibold">{errorState.title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{errorState.description}</p>

      {errorState.autoRetry && autoRetryCount < 3 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Автоматическая повторная попытка...
        </p>
      ) : null}

      {errorState.requestId ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          ID: {errorState.requestId}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {errorState.recoveryActions.map((action) => {
          const Icon = ACTION_ICONS[action];
          const label = getRecoveryActionLabel(action);
          const href = getRecoveryActionHref(action);
          const isPrimary = action === errorState.primaryAction;

          if (action === "none") return null;

          if (action === "retry" && onRetry) {
            return (
              <Button
                key={action}
                variant={isPrimary ? "default" : "outline"}
                size="sm"
                onClick={handleRetry}
                loading={retrying}
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                {label}
              </Button>
            );
          }

          if (action === "refresh") {
            return (
              <Button
                key={action}
                variant={isPrimary ? "default" : "outline"}
                size="sm"
                onClick={() => window.location.reload()}
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                {label}
              </Button>
            );
          }

          if (action === "dismiss" && onDismiss) {
            return (
              <Button
                key={action}
                variant="ghost"
                size="sm"
                onClick={onDismiss}
              >
                {label}
              </Button>
            );
          }

          if (href) {
            return (
              <Button key={action} variant={isPrimary ? "default" : "outline"} size="sm" asChild>
                <a href={href}>
                  {Icon ? <Icon className="size-3.5" /> : null}
                  {label}
                </a>
              </Button>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

// ── Page-Level Error ───────────────────────────────────────────

/**
 * PageError — full-page error state with recovery actions.
 * Used by error.jsx pages.
 *
 * @param {{
 *   error: Error | import("@/types/error-recovery").ErrorState,
 *   reset?: () => void,
 *   className?: string,
 * }} props
 */
export function PageError({ error, reset, className }) {
  return (
    <div className={cn("flex min-h-[50vh] flex-col items-center justify-center p-8", className)}>
      <InlineError
        error={error}
        onRetry={reset}
        className="max-w-md"
      />
    </div>
  );
}

// ── Section Error Boundary Fallback ────────────────────────────

/**
 * SectionError — inline error for collapsible dashboard sections.
 * Shows a compact error bar that doesn't break the page layout.
 *
 * @param {{
 *   title: string,
 *   error: Error | import("@/types/error-recovery").ErrorState | null,
 *   onRetry?: () => void,
 *   className?: string,
 * }} props
 */
export function SectionError({ title, error, onRetry, className }) {
  return (
    <div className={cn("space-y-2", className)}>
      {title ? (
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      ) : null}
      <InlineError error={error} onRetry={onRetry} compact />
    </div>
  );
}
