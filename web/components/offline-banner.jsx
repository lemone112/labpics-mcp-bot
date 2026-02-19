"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const { online } = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center bg-destructive px-4 py-2 text-sm text-destructive-foreground"
    >
      Нет подключения к серверу. Данные могут быть неактуальны.
    </div>
  );
}
