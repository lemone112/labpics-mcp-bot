import { ApiError } from "../infra/api-contract.js";

function pad2(num) {
  return String(num).padStart(2, "0");
}

export function normalizeDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function assertDateRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return;
  const from = dateFrom instanceof Date ? dateFrom : new Date(dateFrom);
  const to = dateTo instanceof Date ? dateTo : new Date(dateTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
  if (from > to) {
    throw new ApiError(400, "invalid_date_range", "date_from must be less than or equal to date_to");
  }
}
