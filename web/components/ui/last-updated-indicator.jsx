import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatSecondsAgo(seconds) {
  if (seconds == null || seconds < 0) return "\u2026";
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч назад`;
}

export function LastUpdatedIndicator({ secondsAgo, onRefresh, loading, className, sseConnected, errorCount }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {sseConnected != null ? (
        <span className={cn("inline-flex items-center gap-1", sseConnected ? "text-success" : "text-warning")}>
          <span className={cn("inline-block size-1.5 rounded-full", sseConnected ? "bg-success" : "bg-warning")} />
          {sseConnected ? "Live" : "Polling"}
        </span>
      ) : null}
      <span>Обновлено: {formatSecondsAgo(secondsAgo)}</span>
      {errorCount != null && errorCount > 0 ? (
        <span className="text-destructive">{errorCount} ош.</span>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-6 px-2 text-xs">
        Обновить
      </Button>
    </div>
  );
}
