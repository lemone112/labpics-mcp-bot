// Error/Recovery Flows — error boundaries, retry, fallback states (Iter 20.11).
// Standardizes error handling across the application.

// ── Error Severity ─────────────────────────────────────────────

export type ErrorSeverity =
  | "info"       // Non-blocking informational message
  | "warning"    // Degraded functionality, partial data
  | "error"      // Feature-level failure (section/component)
  | "critical";  // Page-level or app-level failure

// ── Error Category ─────────────────────────────────────────────
// Determines the error message and recovery strategy.

export type ErrorCategory =
  | "network"     // Network connectivity issue
  | "auth"        // Authentication/authorization failure
  | "not_found"   // Resource not found
  | "validation"  // Client-side validation error
  | "server"      // Server-side error (5xx)
  | "timeout"     // Request timeout
  | "rate_limit"  // Rate limited
  | "maintenance" // Planned maintenance
  | "unknown";    // Unclassified error

// ── Recovery Action ────────────────────────────────────────────

export type RecoveryAction =
  | "retry"        // Retry the failed operation
  | "refresh"      // Refresh the page/section
  | "login"        // Redirect to login
  | "navigate"     // Navigate to another page
  | "contact"      // Show support contact info
  | "dismiss"      // Dismiss the error
  | "none";        // No recovery action available

// ── Error State ────────────────────────────────────────────────

export interface ErrorState {
  /** Error category (determines recovery strategy) */
  category: ErrorCategory;

  /** Error severity (determines UI treatment) */
  severity: ErrorSeverity;

  /** User-friendly error title */
  title: string;

  /** User-friendly error description */
  description: string;

  /** Technical error message (for logging, not shown to user) */
  technicalMessage: string | null;

  /** HTTP status code if applicable */
  statusCode: number | null;

  /** Available recovery actions */
  recoveryActions: RecoveryAction[];

  /** Primary recovery action */
  primaryAction: RecoveryAction;

  /** Whether this error is auto-retryable */
  autoRetry: boolean;

  /** Number of auto-retry attempts remaining */
  autoRetryAttemptsLeft: number;

  /** Delay before next auto-retry (ms) */
  autoRetryDelayMs: number;

  /** Timestamp when error occurred */
  occurredAt: string;

  /** Request ID for support reference */
  requestId: string | null;
}

// ── Error Boundary Config ──────────────────────────────────────
// Configuration for React error boundaries at different levels.

export type ErrorBoundaryLevel =
  | "app"       // Root-level — catches everything, shows full-page error
  | "page"      // Page-level — shows page error, nav still works
  | "section"   // Section-level — shows section error, rest of page works
  | "component"; // Component-level — shows inline error, minimal disruption

export interface ErrorBoundaryConfig {
  /** Error boundary level */
  level: ErrorBoundaryLevel;

  /** Fallback component to render on error */
  fallbackComponent: string;

  /** Whether to auto-retry on mount after error */
  autoRetryOnMount: boolean;

  /** Whether to log error to monitoring service */
  logToMonitoring: boolean;

  /** Custom error handler */
  onError: string | null;
}

// ── Offline Indicator Config ───────────────────────────────────

export interface OfflineIndicatorConfig {
  /** Position of the offline indicator */
  position: "top" | "bottom";

  /** Z-index layer (per DESIGN_SYSTEM_2026.md: z-[80]) */
  zIndex: number;

  /** Whether to show a reconnection countdown */
  showReconnectTimer: boolean;

  /** Message to display */
  message: string;
}

// ── Error Classification Map ───────────────────────────────────
// Maps HTTP status codes and error types to ErrorState configs.
// Used by the classifyError() utility.

export interface ErrorClassification {
  statusCode: number | null;
  errorCode: string | null;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  description: string;
  recoveryActions: RecoveryAction[];
  primaryAction: RecoveryAction;
  autoRetry: boolean;
}
