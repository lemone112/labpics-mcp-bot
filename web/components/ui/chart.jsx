"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

const ChartStyleContext = React.createContext({});

function useChartStyleConfig() {
  return React.useContext(ChartStyleContext);
}

const ChartContainer = React.forwardRef(({ id, className, children, config = {}, ...props }, ref) => {
  const chartId = React.useId();
  const containerId = `chart-${id || chartId.replace(/:/g, "")}`;

  return (
    <ChartStyleContext.Provider value={config}>
      <div
        ref={ref}
        data-chart={containerId}
        className={cn(
          "h-[240px] w-full text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-border/60",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-polar-grid_line]:stroke-border/70",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartStyleContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef(
  ({ active, payload, className, hideLabel = false, formatter, labelFormatter }, ref) => {
    const config = useChartStyleConfig();
    if (!active || !payload?.length) return null;

    const labelRaw = payload[0]?.payload?.label ?? payload[0]?.name;
    const label = labelFormatter ? labelFormatter(labelRaw, payload) : labelRaw;

    return (
      <div
        ref={ref}
        className={cn("min-w-40 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground", className)}
      >
        {!hideLabel && label ? <div className="mb-1 text-[11px] text-muted-foreground">{label}</div> : null}
        <div className="space-y-1">
          {payload.map((item, index) => {
            const key = String(item.dataKey || item.name || index);
            const chartEntry = config[key] || {};
            const markerClassName = chartEntry.markerClassName || "bg-primary";
            const value = formatter ? formatter(item.value, item.name, item, index, payload) : item.value;
            return (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span className={cn("h-2 w-2 rounded-full", markerClassName)} />
                  {chartEntry.label || item.name}
                </span>
                <span className="font-medium text-foreground">{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = "ChartTooltipContent";

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({ payload }) {
  const config = useChartStyleConfig();
  if (!payload?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {payload.map((entry) => {
        const key = String(entry.dataKey || entry.value || "");
        const chartEntry = config[key] || {};
        const markerClassName = chartEntry.markerClassName || "bg-primary";
        return (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", markerClassName)} />
            {chartEntry.label || entry.value}
          </span>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
