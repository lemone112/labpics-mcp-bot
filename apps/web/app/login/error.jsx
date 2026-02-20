"use client";

import { Button } from "@/components/ui/button";

export default function LoginError({ error, reset }) {
  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-base font-semibold">Ошибка авторизации</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error?.message || "Не удалось загрузить страницу авторизации."}
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Повторить</Button>
      </div>
    </div>
  );
}
