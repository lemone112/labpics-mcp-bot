import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function formatRelativeStorage(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "-";
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}
