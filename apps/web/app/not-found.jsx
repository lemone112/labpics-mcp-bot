import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-base font-semibold">Страница не найдена</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Запрашиваемая страница не существует или была перемещена.
      </p>
      <Button variant="outline" asChild>
        <a href="/control-tower/dashboard">На главную</a>
      </Button>
    </div>
  );
}
