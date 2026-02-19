export function ChartNoData({ message = "Недостаточно данных для графика", hint = "После следующего цикла синхронизации график заполнится автоматически." }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-md border border-dashed px-4 text-center">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
