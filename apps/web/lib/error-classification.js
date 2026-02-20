// Error Classification — maps errors to user-friendly messages and recovery strategies.
// Used by error boundaries, inline error states, and toast notifications.

/**
 * @type {import("@/types/error-recovery").ErrorClassification[]}
 */
const ERROR_MAP = [
  // Network errors
  {
    statusCode: null,
    errorCode: "timeout",
    category: "timeout",
    severity: "warning",
    title: "Превышено время ожидания",
    description: "Сервер не ответил вовремя. Попробуйте еще раз.",
    recoveryActions: ["retry", "refresh"],
    primaryAction: "retry",
    autoRetry: true,
  },
  {
    statusCode: null,
    errorCode: "network",
    category: "network",
    severity: "warning",
    title: "Нет соединения с сервером",
    description: "Проверьте подключение к интернету.",
    recoveryActions: ["retry", "refresh"],
    primaryAction: "retry",
    autoRetry: true,
  },

  // Auth errors
  {
    statusCode: 401,
    errorCode: null,
    category: "auth",
    severity: "error",
    title: "Сессия истекла",
    description: "Войдите в систему заново для продолжения работы.",
    recoveryActions: ["login"],
    primaryAction: "login",
    autoRetry: false,
  },
  {
    statusCode: 403,
    errorCode: null,
    category: "auth",
    severity: "error",
    title: "Нет доступа",
    description: "У вас нет прав для выполнения этого действия.",
    recoveryActions: ["navigate", "contact"],
    primaryAction: "navigate",
    autoRetry: false,
  },

  // Not found
  {
    statusCode: 404,
    errorCode: null,
    category: "not_found",
    severity: "warning",
    title: "Не найдено",
    description: "Запрашиваемый ресурс не существует или был удален.",
    recoveryActions: ["navigate", "refresh"],
    primaryAction: "navigate",
    autoRetry: false,
  },

  // Validation
  {
    statusCode: 400,
    errorCode: null,
    category: "validation",
    severity: "warning",
    title: "Ошибка в данных",
    description: "Проверьте введенные данные и попробуйте снова.",
    recoveryActions: ["dismiss"],
    primaryAction: "dismiss",
    autoRetry: false,
  },
  {
    statusCode: 422,
    errorCode: null,
    category: "validation",
    severity: "warning",
    title: "Ошибка валидации",
    description: "Данные не прошли проверку. Исправьте и повторите.",
    recoveryActions: ["dismiss"],
    primaryAction: "dismiss",
    autoRetry: false,
  },

  // Rate limit
  {
    statusCode: 429,
    errorCode: null,
    category: "rate_limit",
    severity: "warning",
    title: "Слишком много запросов",
    description: "Подождите немного перед повторной попыткой.",
    recoveryActions: ["retry"],
    primaryAction: "retry",
    autoRetry: true,
  },

  // Server errors
  {
    statusCode: 500,
    errorCode: null,
    category: "server",
    severity: "error",
    title: "Ошибка сервера",
    description: "Произошла внутренняя ошибка. Мы уже работаем над исправлением.",
    recoveryActions: ["retry", "refresh"],
    primaryAction: "retry",
    autoRetry: true,
  },
  {
    statusCode: 502,
    errorCode: null,
    category: "server",
    severity: "error",
    title: "Сервер временно недоступен",
    description: "Повторите попытку через несколько секунд.",
    recoveryActions: ["retry", "refresh"],
    primaryAction: "retry",
    autoRetry: true,
  },
  {
    statusCode: 503,
    errorCode: null,
    category: "maintenance",
    severity: "warning",
    title: "Техническое обслуживание",
    description: "Система временно недоступна. Попробуйте позже.",
    recoveryActions: ["refresh"],
    primaryAction: "refresh",
    autoRetry: true,
  },
];

/**
 * Classifies an error into a user-friendly ErrorState.
 *
 * @param {Error & { status?: number, payload?: Record<string, unknown> }} error
 * @returns {import("@/types/error-recovery").ErrorState}
 */
export function classifyError(error) {
  const statusCode = error?.status ?? null;
  const message = String(error?.message || "").toLowerCase();

  // Try to match by status code first
  let classification = null;

  if (statusCode) {
    classification = ERROR_MAP.find((e) => e.statusCode === statusCode);
  }

  // Try to match by error code patterns
  if (!classification) {
    if (message.includes("timeout") || message.includes("abort")) {
      classification = ERROR_MAP.find((e) => e.errorCode === "timeout");
    } else if (
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("net::err") ||
      message.includes("load failed")
    ) {
      classification = ERROR_MAP.find((e) => e.errorCode === "network");
    }
  }

  // Default fallback
  if (!classification) {
    classification = {
      statusCode: null,
      errorCode: null,
      category: "unknown",
      severity: "error",
      title: "Что-то пошло не так",
      description: "Произошла непредвиденная ошибка. Попробуйте еще раз.",
      recoveryActions: ["retry", "refresh"],
      primaryAction: "retry",
      autoRetry: false,
    };
  }

  // Build request ID
  let requestId = null;
  try {
    requestId = error?.payload?.requestId || error?.payload?.request_id || null;
  } catch {
    // ignore
  }

  return {
    category: classification.category,
    severity: classification.severity,
    title: classification.title,
    description: classification.description,
    technicalMessage: error?.message || null,
    statusCode,
    recoveryActions: classification.recoveryActions,
    primaryAction: classification.primaryAction,
    autoRetry: classification.autoRetry,
    autoRetryAttemptsLeft: classification.autoRetry ? 3 : 0,
    autoRetryDelayMs: classification.autoRetry ? 2000 : 0,
    occurredAt: new Date().toISOString(),
    requestId,
  };
}

/**
 * Returns a user-friendly recovery action label.
 *
 * @param {import("@/types/error-recovery").RecoveryAction} action
 * @returns {string}
 */
export function getRecoveryActionLabel(action) {
  const labels = {
    retry: "Повторить",
    refresh: "Обновить страницу",
    login: "Войти заново",
    navigate: "На главную",
    contact: "Связаться с поддержкой",
    dismiss: "Закрыть",
    none: "",
  };
  return labels[action] || "Повторить";
}

/**
 * Returns the href for a recovery action.
 *
 * @param {import("@/types/error-recovery").RecoveryAction} action
 * @returns {string | null}
 */
export function getRecoveryActionHref(action) {
  const hrefs = {
    login: "/login",
    navigate: "/control-tower/dashboard",
  };
  return hrefs[action] || null;
}
