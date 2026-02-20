import { useMemo } from "react";

export function toRuDateLabel(point, options = { month: "short", day: "numeric" }) {
  if (!point) return "-";
  const date = new Date(point);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ru-RU", options);
}

export function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function seriesHasVisibleValues(items, keys = ["value"]) {
  if (!Array.isArray(items) || !items.length) return false;
  return items.some((item) => keys.some((key) => Math.abs(numberValue(item?.[key])) > 0));
}

export function formatHumanDateRu(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTimeRu(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const rtf = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, "month");
}

export function useFormatters() {
  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat("ru-RU"), []);
  return { moneyFormatter, numberFormatter };
}

export const TITLES = {
  dashboard: "Дашборд",
  messages: "Переписки",
  agreements: "Договоренности",
  risks: "Риски",
  finance: "Финансы и экономика",
  offers: "Офферы",
};

export const SUBTITLES = {
  dashboard: "Ключевые графики состояния проектов и полноты данных",
  messages: "Лента сообщений по выбранному проекту и персоне",
  agreements: "Договоренности, извлеченные из RAG/Evidence",
  risks: "Карточки рисков и паттернов",
  finance: "Финансовые и юнит-экономические метрики",
  offers: "Офферы и допродажи по ценности клиента",
};

export const PRIMARY_CTA = {
  dashboard: "Синхронизировать",
  messages: "Запустить дайджест",
  agreements: "Запустить извлечение",
  risks: "Запустить сканирование",
  finance: "Сгенерировать отчёт",
  offers: "Создать оффер",
};

export const EMPTY_WIZARD = {
  dashboard: { reason: "Подключите источники данных для отображения дашборда.", steps: ["Подключите источники данных", "Запустите синхронизацию", "Дождитесь накопления данных"] },
  messages: { reason: "Нет подключённых источников сообщений.", steps: ["Подключите Chatwoot", "Запустите синхронизацию", "Дождитесь загрузки переписок"] },
  agreements: { reason: "Извлечение договорённостей ещё не запускалось.", steps: ["Подключите источники данных", "Запустите извлечение", "Дождитесь анализа"] },
  risks: { reason: "Сканирование рисков ещё не запускалось.", steps: ["Подключите источники данных", "Запустите сканирование", "Дождитесь анализа"] },
  finance: { reason: "Подключите Attio для финансовых данных.", steps: ["Подключите Attio", "Запустите синхронизацию", "Дождитесь анализа"] },
  offers: { reason: "Нет офферов для отображения.", steps: ["Подключите источники данных", "Запустите синхронизацию", "Создайте первый оффер"] },
};
