"use client";

export function readStorageValue<T = string | null>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return (value == null ? fallback : (value as T));
  } catch (error) {
    console.warn("[safe-storage] read failed", { key, error: String((error as Error)?.message || error) });
    return fallback;
  }
}

export function writeStorageValue(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, String(value));
    return true;
  } catch (error) {
    console.warn("[safe-storage] write failed", { key, error: String((error as Error)?.message || error) });
    return false;
  }
}

export function readStorageBool(key: string, fallback: boolean): boolean {
  const raw = readStorageValue<string>(key, fallback ? "1" : "0");
  if (raw === "1") return true;
  if (raw === "0") return false;
  return Boolean(fallback);
}

export function writeStorageBool(key: string, value: boolean): boolean {
  return writeStorageValue(key, value ? "1" : "0");
}
