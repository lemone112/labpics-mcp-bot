"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }) {
  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-base font-semibold">Что-то пошло не так</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error?.message || "Произошла непредвиденная ошибка."}
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>Повторить</Button>
        <Button variant="outline" asChild>
          <a href="/control-tower/dashboard">На главную</a>
        </Button>
      </div>
    </div>
  );
}
