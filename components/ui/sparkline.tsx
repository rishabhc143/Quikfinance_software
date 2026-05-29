import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny inline SVG line chart for KPI cards. No axes, no tooltip, no
 * dependency on recharts (that lib is overkill here and forces a client
 * component). 50 lines of math, server-renderable.
 *
 * Render path: normalize the input array to [0,1] within the chart's
 * inner box, build a polyline path, draw + a soft area fill underneath.
 * If all values are identical (flat line), we still draw it at mid-height
 * so the user sees something.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  variant = "primary",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  variant?: "primary" | "success" | "destructive" | "muted";
}) {
  if (!data || data.length === 0) {
    return (
      <div
        className={cn("text-[10px] text-muted-foreground", className)}
        style={{ width, height }}
        aria-hidden
      />
    );
  }

  const padX = 1;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid div-by-zero on flat series

  const points = data.map((v, i) => {
    const x = padX + (i / (data.length - 1 || 1)) * innerW;
    const y = padY + (1 - (v - min) / range) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(" ");

  // Area path: same as line, then drop down to the baseline and close.
  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(2)} ${(padY + innerH).toFixed(2)} L ${points[0][0].toFixed(2)} ${(padY + innerH).toFixed(2)} Z`;

  // Map variant → text-color class. The stroke + fill pick up
  // `currentColor` so they follow whatever color the parent sets.
  const colorClass = {
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[variant];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(colorClass, className)}
      role="img"
      aria-label="trend"
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.12} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={1.75}
        fill="currentColor"
      />
    </svg>
  );
}
