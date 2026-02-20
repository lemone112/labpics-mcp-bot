// Setup Wizard — data model for guided onboarding/setup flows.
// Powers the step-by-step project setup experience (Iter 20.3).

// ── Step Status ────────────────────────────────────────────────

export type SetupStepStatus =
  | "locked"      // Not yet reachable (dependencies unmet)
  | "available"   // Ready to be started
  | "in_progress" // Currently being worked on
  | "completed"   // Finished successfully
  | "skipped";    // User chose to skip (optional steps only)

// ── Step Definition ────────────────────────────────────────────

export interface SetupStep {
  /** Unique step identifier */
  id: string;

  /** Step number (1-based, for display) */
  order: number;

  /** Short title */
  title: string;

  /** Longer description of what this step does */
  description: string;

  /** Current status */
  status: SetupStepStatus;

  /** Whether this step can be skipped */
  optional: boolean;

  /** IDs of steps that must be completed before this one */
  dependsOn: string[];

  /** Deep link to the relevant page/section for this step */
  href: string | null;

  /** Estimated time to complete (in minutes) */
  estimatedMinutes: number | null;

  /** Completion percentage (0-100) for multi-part steps */
  progress: number;

  /** Help text or tooltip content */
  helpText: string | null;
}

// ── Wizard State ───────────────────────────────────────────────

export interface SetupWizardState {
  /** Unique wizard instance ID */
  id: string;

  /** Project this wizard belongs to */
  projectId: string;

  /** Project name for display */
  projectName: string;

  /** Ordered list of steps */
  steps: SetupStep[];

  /** ID of the currently active step (or null if all done) */
  activeStepId: string | null;

  /** Overall completion percentage (0-100) */
  overallProgress: number;

  /** Whether all required steps are completed */
  isComplete: boolean;

  /** ISO 8601 timestamp — when setup was started */
  startedAt: string;

  /** ISO 8601 timestamp — when setup was completed (null if in progress) */
  completedAt: string | null;
}

// ── Wizard Config (for creating new wizards) ───────────────────

export interface SetupWizardConfig {
  /** Template name for the wizard type */
  template: "project_onboarding" | "integration_setup" | "data_import";

  /** Steps to include (subset of template steps) */
  stepIds?: string[];

  /** Project ID to bind to */
  projectId: string;
}

// ── API Response ───────────────────────────────────────────────

export interface SetupWizardResponse {
  wizard: SetupWizardState;
}

export interface SetupWizardStepUpdatePayload {
  status: SetupStepStatus;
  progress?: number;
}
