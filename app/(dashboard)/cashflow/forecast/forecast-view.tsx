"use client";

import * as React from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Area,
  ComposedChart,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clock,
  FlaskConical,
  TrendingUp as TrendingUpIcon,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type {
  CashflowForecast,
  ForecastDay,
  ForecastItem,
} from "@/lib/cashflow/types";

/**
 * Client renderer for CF-1/CF-2/CF-3 forecast. Four layers:
 *   1. Stress-test button group (CF-3) — URL-syncs ?stressDays=N
 *   2. Summary cards (starting / ending / net / min-balance) + base-vs-stress delta
 *   3. Running-balance line chart over the full horizon
 *   4. Weekly grid with expandable per-day drilldown
 *
 * No data fetching here — the page passes the full projection in.
 * When a stress scenario is active, the page also computes the base
 * case so the UI can show a comparison delta card.
 */
export function ForecastView({
  forecast,
  baseForecast,
  stressOptions,
}: {
  forecast: CashflowForecast;
  baseForecast: CashflowForecast | null;
  stressOptions: number[];
}) {
  const { summary, weeks, days, currency, stressDays } = forecast;

  // Chart data — one point per day with running balance + zero
  // reference line for the eye to track. We also surface inflow /
  // outflow magnitudes as muted areas to give context for the curve.
  const chartData = days.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "MMM d"),
    balance: d.runningBalance,
    inflow: d.totalIn,
    outflow: -d.totalOut,
  }));

  return (
    <div className="space-y-6">
      {/* ── CF-3 — Stress-test scenario picker ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
          <FlaskConical className="h-4 w-4" />
          <span>Stress test:</span>
        </div>
        {stressOptions.map((days) => {
          const isActive = stressDays === days;
          const href = days === 0
            ? "/cashflow/forecast"
            : `/cashflow/forecast?stressDays=${days}`;
          return (
            <Link
              key={days}
              href={href}
              prefetch={false}
              className={cn(
                "inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input text-foreground"
              )}
            >
              {days === 0 ? "Base case" : `+${days}d`}
            </Link>
          );
        })}
        {stressDays > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            All customer inflows shifted later by {stressDays} days on
            top of any learned payment delay.
          </span>
        )}
      </div>

      {/* ── Base-vs-stress delta banner (only when stress > 0) ─────── */}
      {baseForecast && stressDays > 0 && (
        <StressDeltaCard
          base={baseForecast}
          stress={forecast}
          currency={currency}
        />
      )}

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Starting balance"
          value={formatMoney(summary.startingBalance, currency)}
          hint="As of today, across all active bank accounts."
          icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          label="Projected ending balance"
          value={formatMoney(summary.endingBalance, currency)}
          hint={`In ${forecast.horizonDays} days (${format(parseISO(forecast.endDate), "d MMM yyyy")})`}
          icon={
            summary.netCashflow >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-rose-600" />
            )
          }
          accent={summary.netCashflow >= 0 ? "positive" : "negative"}
        />
        <SummaryCard
          label="Net cashflow"
          value={formatMoney(summary.netCashflow, currency)}
          hint={`${formatMoney(summary.totalInflows, currency)} in − ${formatMoney(summary.totalOutflows, currency)} out`}
          accent={summary.netCashflow >= 0 ? "positive" : "negative"}
        />
        <SummaryCard
          label="Minimum balance"
          value={formatMoney(summary.minBalance, currency)}
          hint={
            summary.minBalanceDate
              ? `Lowest on ${format(parseISO(summary.minBalanceDate), "d MMM yyyy")}`
              : "Stable"
          }
          accent={summary.hasInsolvencyRisk ? "negative" : "neutral"}
          icon={
            summary.hasInsolvencyRisk ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : undefined
          }
        />
      </div>

      {/* ── Insolvency alert ─────────────────────────────────────────── */}
      {summary.hasInsolvencyRisk && (
        <div className="rounded-md border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-950/20 p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong>Insolvency risk flagged.</strong> The projection
            shows your running balance going negative on{" "}
            <span className="font-mono">
              {summary.minBalanceDate
                ? format(parseISO(summary.minBalanceDate), "d MMM yyyy")
                : "—"}
            </span>
            . Review the weekly grid below to spot which inflows or
            outflows drive the dip and consider rescheduling.
          </div>
        </div>
      )}

      {/* ── Predictive layer notice ─────────────────────────────────── */}
      {summary.patternsApplied > 0 && (
        <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 p-3 text-sm flex items-start gap-2">
          <TrendingUpIcon className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong>Predictive adjustment applied.</strong>{" "}
            {summary.patternsApplied} invoice / bill{" "}
            {summary.patternsApplied === 1 ? "item was" : "items were"}{" "}
            shifted from the contractual due date based on the last 12
            months of payment history for that customer or vendor.
            Hover any item with a clock icon below to see the original
            due date.
          </div>
        </div>
      )}

      {/* ── Running-balance line chart ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Daily running balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  // Show ~12 X-axis ticks across 84 days
                  interval={Math.max(1, Math.floor(chartData.length / 12))}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => compactMoney(v)}
                />
                <Tooltip
                  formatter={(v: number) => formatMoney(v, currency)}
                  labelFormatter={(l: string) => l}
                  contentStyle={{ fontSize: 12 }}
                />
                <ReferenceLine
                  y={0}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  fill="#dcfce7"
                  stroke="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  fill="#fee2e2"
                  stroke="none"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Blue line is your projected running balance. Green / red
            areas are daily inflows / outflows. Red dashed line marks
            zero — when the blue line dips below it, you go negative.
          </p>
        </CardContent>
      </Card>

      {/* ── Weekly grid with expandable daily detail ─────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Weekly breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10"></th>
                  <th className="px-3 py-2 text-left">Week</th>
                  <th className="px-3 py-2 text-right">Inflows</th>
                  <th className="px-3 py-2 text-right">Outflows</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">Ending balance</th>
                  <th className="px-3 py-2 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {weeks.map((w, idx) => (
                  <WeekRow
                    key={w.weekStart}
                    week={w}
                    weekNumber={idx + 1}
                    days={days.filter(
                      (d) => d.date >= w.weekStart && d.date <= w.weekEnd
                    )}
                    currency={currency}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: "positive" | "negative" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {icon}
        </div>
        <div
          className={cn(
            "text-2xl font-semibold mt-1 tabular-nums",
            accent === "negative" && "text-rose-600",
            accent === "positive" && "text-emerald-700"
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function WeekRow({
  week,
  weekNumber,
  days,
  currency,
}: {
  week: import("@/lib/cashflow/types").ForecastWeek;
  weekNumber: number;
  days: ForecastDay[];
  currency: string;
}) {
  const [open, setOpen] = React.useState(false);
  const negative = week.net < 0;
  const insolvent = week.minBalance < 0;

  return (
    <>
      <tr
        className={cn(
          "hover:bg-muted/30 cursor-pointer",
          insolvent && "bg-rose-50/40 dark:bg-rose-950/10"
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2 align-middle">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-3 py-2">
          <div className="font-medium">Week {weekNumber}</div>
          <div className="text-xs text-muted-foreground">
            {format(parseISO(week.weekStart), "d MMM")} –{" "}
            {format(parseISO(week.weekEnd), "d MMM yyyy")}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
          {week.totalIn > 0 ? formatMoney(week.totalIn, currency) : "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-rose-600">
          {week.totalOut > 0 ? formatMoney(week.totalOut, currency) : "—"}
        </td>
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums font-medium",
            negative && "text-rose-600",
            !negative && week.net > 0 && "text-emerald-700"
          )}
        >
          {formatMoney(week.net, currency)}
        </td>
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums",
            insolvent && "text-rose-600 font-medium"
          )}
        >
          {formatMoney(week.endingBalance, currency)}
        </td>
        <td className="px-3 py-2 text-center">
          {insolvent ? (
            <Badge variant="destructive" className="text-xs">
              Below zero
            </Badge>
          ) : negative ? (
            <Badge variant="secondary" className="text-xs">
              Deficit
            </Badge>
          ) : (
            <Badge variant="success" className="text-xs">
              Surplus
            </Badge>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/10">
          <td></td>
          <td colSpan={6} className="p-3">
            <DayDrilldown days={days} currency={currency} />
          </td>
        </tr>
      )}
    </>
  );
}

function DayDrilldown({
  days,
  currency,
}: {
  days: ForecastDay[];
  currency: string;
}) {
  const active = days.filter((d) => d.totalIn > 0 || d.totalOut > 0);
  if (active.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No scheduled inflows or outflows in this week.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {active.map((d) => (
        <div
          key={d.date}
          className="rounded border bg-background p-2 text-xs"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium text-sm">
              {format(parseISO(d.date), "EEE, d MMM yyyy")}
            </div>
            <div className="text-muted-foreground tabular-nums">
              Balance after: {formatMoney(d.runningBalance, currency)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              {d.inflows.length > 0 ? (
                <ul className="space-y-0.5">
                  {d.inflows.map((it, i) => (
                    <ItemLine
                      key={i}
                      item={it}
                      currency={currency}
                      direction="in"
                    />
                  ))}
                </ul>
              ) : (
                <div className="text-muted-foreground italic">
                  No inflows
                </div>
              )}
            </div>
            <div>
              {d.outflows.length > 0 ? (
                <ul className="space-y-0.5">
                  {d.outflows.map((it, i) => (
                    <ItemLine
                      key={i}
                      item={it}
                      currency={currency}
                      direction="out"
                    />
                  ))}
                </ul>
              ) : (
                <div className="text-muted-foreground italic">
                  No outflows
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StressDeltaCard({
  base,
  stress,
  currency,
}: {
  base: CashflowForecast;
  stress: CashflowForecast;
  currency: string;
}) {
  const minDelta = stress.summary.minBalance - base.summary.minBalance;
  const endDelta = stress.summary.endingBalance - base.summary.endingBalance;
  const newRisk =
    stress.summary.hasInsolvencyRisk && !base.summary.hasInsolvencyRisk;
  const weekDelta =
    stress.summary.weeksWithDeficit - base.summary.weeksWithDeficit;

  return (
    <div
      className={cn(
        "rounded-md border-l-4 p-3 text-sm space-y-1",
        newRisk
          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/20"
          : "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
      )}
    >
      <div className="flex items-start gap-2">
        <FlaskConical
          className={cn(
            "h-4 w-4 shrink-0 mt-0.5",
            newRisk ? "text-rose-600" : "text-amber-600"
          )}
        />
        <div className="flex-1">
          <strong>Under +{stress.stressDays}d stress:</strong>
          <ul className="mt-1 space-y-0.5 text-xs">
            <li>
              <span className="text-muted-foreground">Minimum balance:</span>{" "}
              <span className="font-mono">
                {formatMoney(base.summary.minBalance, currency)}
              </span>
              {" → "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  minDelta < 0 && "text-rose-700"
                )}
              >
                {formatMoney(stress.summary.minBalance, currency)}
              </span>{" "}
              <span
                className={cn(
                  "text-xs",
                  minDelta < 0 ? "text-rose-600" : "text-emerald-600"
                )}
              >
                ({minDelta < 0 ? "" : "+"}
                {formatMoney(minDelta, currency)})
              </span>
            </li>
            <li>
              <span className="text-muted-foreground">Ending balance:</span>{" "}
              <span className="font-mono">
                {formatMoney(base.summary.endingBalance, currency)}
              </span>
              {" → "}
              <span
                className={cn(
                  "font-mono",
                  endDelta < 0 && "text-rose-700"
                )}
              >
                {formatMoney(stress.summary.endingBalance, currency)}
              </span>{" "}
              <span
                className={cn(
                  "text-xs",
                  endDelta < 0 ? "text-rose-600" : "text-emerald-600"
                )}
              >
                ({endDelta < 0 ? "" : "+"}
                {formatMoney(endDelta, currency)})
              </span>
            </li>
            <li>
              <span className="text-muted-foreground">
                Weeks with deficit:
              </span>{" "}
              <span className="font-mono">{base.summary.weeksWithDeficit}</span>
              {" → "}
              <span className="font-mono font-semibold">
                {stress.summary.weeksWithDeficit}
              </span>{" "}
              {weekDelta !== 0 && (
                <span
                  className={cn(
                    "text-xs",
                    weekDelta > 0 ? "text-rose-600" : "text-emerald-600"
                  )}
                >
                  ({weekDelta > 0 ? "+" : ""}
                  {weekDelta} {Math.abs(weekDelta) === 1 ? "week" : "weeks"})
                </span>
              )}
            </li>
            {newRisk && (
              <li className="mt-1 font-semibold text-rose-700">
                ⚠ Insolvency risk emerges under this scenario — base
                case stays solvent but stress case dips below zero.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ItemLine({
  item,
  currency,
  direction,
}: {
  item: ForecastItem;
  currency: string;
  direction: "in" | "out";
}) {
  const color = direction === "in" ? "text-emerald-700" : "text-rose-600";
  const arrow = direction === "in" ? "↑" : "↓";
  // CF-2 — show a small clock icon + tooltip when this item was
  // shifted from its contractual due date by the learned-delay layer.
  const shifted =
    item.originalDate && item.delayAppliedDays && item.delayAppliedDays !== 0;
  const tooltip = shifted
    ? `Originally due ${format(parseISO(item.originalDate!), "d MMM yyyy")} — shifted ${
        item.delayAppliedDays! > 0 ? "+" : ""
      }${item.delayAppliedDays}d based on history`
    : undefined;

  return (
    <li className={cn("flex items-center justify-between", color)}>
      <span className="truncate flex items-center gap-1 min-w-0">
        <span>{arrow}</span>
        <span className="truncate">{item.label}</span>
        {shifted && (
          <span
            title={tooltip}
            className="text-blue-600 dark:text-blue-400 shrink-0 inline-flex items-center"
            aria-label={tooltip}
          >
            <Clock className="h-3 w-3" />
            <span className="ml-0.5 text-[10px] font-mono">
              {item.delayAppliedDays! > 0
                ? `+${item.delayAppliedDays}d`
                : `${item.delayAppliedDays}d`}
            </span>
          </span>
        )}
      </span>
      <span className={cn("tabular-nums ml-2 shrink-0", color)}>
        {formatMoney(item.amount, currency)}
      </span>
    </li>
  );
}

/**
 * Compact money formatter for Y-axis ticks. Avoids "1,23,456" cluttering
 * the chart axis — uses K / L / Cr suffixes for INR; M / B otherwise.
 */
function compactMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}
