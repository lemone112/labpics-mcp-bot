import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function normalizeProjectIds(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}
