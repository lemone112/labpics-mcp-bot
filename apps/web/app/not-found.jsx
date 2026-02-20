import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-base font-semibold">Страница не найдена</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Запрашиваемая страница не существует или была перемещена.
      </p>
      <Link
        href="/control-tower/dashboard"
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        На главную
      </Link>
    </div>
  );
}
