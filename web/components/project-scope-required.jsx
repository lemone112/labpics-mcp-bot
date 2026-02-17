"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProjectScopeRequired({
  title = "Сначала выберите активный проект",
  description = "Функция работает в контексте конкретного проекта. Перейдите в список проектов и выберите нужный.",
}) {
  return (
    <Card data-motion-item>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Link href="/projects">
          <Button>Открыть проекты</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
