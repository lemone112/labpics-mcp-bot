function pad2(num) {
  return String(num).padStart(2, "0");
}

export function formatDateForApi(value) {
  if (!(value instanceof Date)) return null;
  if (Number.isNaN(value.getTime())) return null;
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}
