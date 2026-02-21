export function humanizeProjectError(rawError: unknown, fallbackMessage: string): string {
  const message = String((rawError as { message?: string } | null)?.message || fallbackMessage || "").trim();
  if (!message) return "Не удалось обработать запрос по проектам";

  const normalized = message.toLowerCase();
  if (normalized === "internal_error") return "Временная ошибка сервера. Повторим автоматически.";
  if (normalized.includes("account_scope_mismatch")) return "Выбранные проекты относятся к разным рабочим областям.";
  if (normalized.includes("project_not_found")) return "Проект больше не доступен. Обновим список автоматически.";
  return message;
}
