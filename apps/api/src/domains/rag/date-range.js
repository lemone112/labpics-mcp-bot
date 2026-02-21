function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function buildUtcDayRange(dateFromValue, dateToValue) {
  const dateFromRaw = toDateOrNull(dateFromValue);
  const dateToRaw = toDateOrNull(dateToValue);

  const dateFrom = dateFromRaw ? startOfUtcDay(dateFromRaw) : null;
  const dateTo = dateToRaw ? startOfUtcDay(dateToRaw) : null;
  const dateToExclusive = dateTo ? new Date(dateTo.getTime() + (24 * 60 * 60 * 1000)) : null;

  return { dateFrom, dateTo, dateToExclusive };
}
