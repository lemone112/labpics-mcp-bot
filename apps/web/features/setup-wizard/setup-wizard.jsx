"use client";

import { useCallback, useEffect, useRef } from "react";
import { Check, ChevronRight, Clock, Lock, SkipForward } from "lucide-react";
import { animate } from "animejs";

import { cn } from "@/lib/utils";
import { MOTION, motionEnabled } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── Step Icon ──────────────────────────────────────────────────

const STEP_STATUS_CONFIG = {
  locked: {
    icon: Lock,
    ringClass: "border-muted bg-muted/30",
    iconClass: "text-muted-foreground/50",
    label: "Заблокировано",
  },
  available: {
    icon: ChevronRight,
    ringClass: "border-primary/40 bg-primary/5",
    iconClass: "text-primary",
    label: "Доступно",
  },
  in_progress: {
    icon: Clock,
    ringClass: "border-primary bg-primary/10",
    iconClass: "text-primary",
    label: "В процессе",
  },
  completed: {
    icon: Check,
    ringClass: "border-success/40 bg-success/10",
    iconClass: "text-success",
    label: "Завершено",
  },
  skipped: {
    icon: SkipForward,
    ringClass: "border-border bg-muted/30",
    iconClass: "text-muted-foreground",
    label: "Пропущено",
  },
};

function StepIndicator({ order, status }) {
  const config = STEP_STATUS_CONFIG[status] || STEP_STATUS_CONFIG.locked;
  const Icon = config.icon;
  const isCompleted = status === "completed";

  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        config.ringClass,
      )}
    >
      {isCompleted ? (
        <Icon className={cn("size-4", config.iconClass)} />
      ) : (
        <span className={cn("text-xs font-semibold", config.iconClass)}>{order}</span>
      )}
    </div>
  );
}

// ── Connector Line ─────────────────────────────────────────────

function StepConnector({ completed }) {
  return (
    <div className="ml-[15px] h-6 w-0.5 shrink-0">
      <div
        className={cn(
          "h-full w-full rounded-full transition-colors",
          completed ? "bg-success/40" : "bg-border",
        )}
      />
    </div>
  );
}

// ── Progress Bar ───────────────────────────────────────────────

function ProgressBar({ value, className }) {
  const barRef = useRef(null);

  useEffect(() => {
    if (!barRef.current || !motionEnabled()) {
      if (barRef.current) barRef.current.style.width = `${value}%`;
      return;
    }
    const anim = animate(barRef.current, {
      width: `${value}%`,
      duration: MOTION.durations.slow,
      ease: MOTION.easing.standard,
    });
    return () => anim.cancel();
  }, [value]);

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        ref={barRef}
        className="h-full rounded-full bg-primary transition-colors w-0"
      />
    </div>
  );
}

// ── Single Step ────────────────────────────────────────────────

function WizardStep({
  step,
  isLast,
  onNavigate,
  onSkip,
}) {
  const config = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.locked;
  const isInteractive = step.status === "available" || step.status === "in_progress";
  const isLocked = step.status === "locked";

  return (
    <div>
      <div
        className={cn(
          "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
          isInteractive && "cursor-pointer hover:bg-accent/50",
          isLocked && "opacity-60",
        )}
        onClick={isInteractive && step.href ? () => onNavigate?.(step) : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNavigate?.(step);
                }
              }
            : undefined
        }
      >
        <StepIndicator order={step.order} status={step.status} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                step.status === "completed" && "text-muted-foreground line-through",
                isLocked && "text-muted-foreground",
              )}
            >
              {step.title}
            </span>
            {step.optional ? (
              <span className="text-xs text-muted-foreground">(опционально)</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>

          {step.status === "in_progress" && step.progress > 0 && step.progress < 100 ? (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={step.progress} className="max-w-[120px]" />
              <span className="text-xs text-muted-foreground">{step.progress}%</span>
            </div>
          ) : null}

          {step.estimatedMinutes && isInteractive ? (
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              ~{step.estimatedMinutes} мин
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {step.optional && step.status === "available" ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSkip?.(step);
                    }}
                  >
                    <SkipForward className="size-3.5" />
                    <span className="sr-only">Пропустить</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Пропустить шаг</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          {isInteractive && step.href ? (
            <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          ) : null}
        </div>
      </div>

      {!isLast ? (
        <StepConnector completed={step.status === "completed" || step.status === "skipped"} />
      ) : null}
    </div>
  );
}

// ── Main Wizard Component ──────────────────────────────────────

/**
 * SetupWizard — guided step-by-step onboarding/setup flow.
 *
 * Uses the wizard pattern from EmptyState with numbered steps,
 * enhanced with interactivity, progress tracking, and deep links.
 *
 * @param {{
 *   wizard: import("@/types/setup-wizard").SetupWizardState | null,
 *   loading?: boolean,
 *   onNavigateStep?: (step: import("@/types/setup-wizard").SetupStep) => void,
 *   onSkipStep?: (step: import("@/types/setup-wizard").SetupStep) => void,
 *   onDismiss?: () => void,
 *   className?: string,
 * }} props
 */
export function SetupWizard({
  wizard,
  loading = false,
  onNavigateStep,
  onSkipStep,
  onDismiss,
  className,
}) {
  const containerRef = useRef(null);

  // Entrance animation for the wizard card
  useEffect(() => {
    if (!containerRef.current || !motionEnabled() || loading) return;
    const anim = animate(containerRef.current, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: MOTION.durations.base,
      ease: MOTION.easing.standard,
    });
    return () => anim.cancel();
  }, [loading]);

  if (loading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="h-5 w-40 rounded-sm bg-muted animate-pulse" />
          <div className="mt-2 h-3 w-64 rounded-sm bg-muted animate-pulse" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 rounded-sm bg-muted animate-pulse" />
                <div className="h-2.5 w-48 rounded-sm bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!wizard) return null;

  const completedCount = wizard.steps.filter(
    (s) => s.status === "completed" || s.status === "skipped",
  ).length;
  const totalSteps = wizard.steps.length;

  return (
    <Card ref={containerRef} className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle as="h2">
              Настройка: {wizard.projectName}
            </CardTitle>
            <CardDescription className="mt-1">
              {wizard.isComplete
                ? "Все шаги завершены!"
                : `Шаг ${completedCount + 1} из ${totalSteps} — ${wizard.overallProgress}% завершено`}
            </CardDescription>
          </div>
          {onDismiss && wizard.isComplete ? (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Скрыть
            </Button>
          ) : null}
        </div>
        <ProgressBar value={wizard.overallProgress} className="mt-3" />
      </CardHeader>

      <CardContent>
        <div className="space-y-0">
          {wizard.steps.map((step, index) => (
            <WizardStep
              key={step.id}
              step={step}
              isLast={index === wizard.steps.length - 1}
              onNavigate={onNavigateStep}
              onSkip={onSkipStep}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
