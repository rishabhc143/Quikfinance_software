/**
 * CF-1 — Deterministic 12-week cashflow forecast types.
 *
 * Shared shapes between the engine (`forecast.ts`), the page server
 * component, the client chart, and the unit tests. No business logic
 * here — pure data definitions.
 */

export type ForecastItemSource =
  | "invoice"
  | "recurring-invoice"
  | "bill"
  | "recurring-bill"
  | "recurring-expense";

export type ForecastItem = {
  source: ForecastItemSource;
  /** Underlying row id — links back to the source record. */
  refId: string;
  /** Human-readable label rendered in the per-day drilldown. */
  label: string;
  /** Always positive; the sign is implied by inflow/outflow placement. */
  amount: number;
  /** CF-2 — when the predictive payment-delay layer shifted this
   *  item from its contractual due date, this holds the original
   *  "yyyy-MM-dd" so the UI can show both. Absent when no shift was
   *  applied (recurring profiles, items where the customer/vendor
   *  has < MIN_SAMPLE_SIZE historical payments). */
  originalDate?: string;
  /** CF-2 — signed shift in days. Positive = paid later than due
   *  date (customer pays late); negative = paid earlier. */
  delayAppliedDays?: number;
};

export type ForecastDay = {
  /** ISO date "yyyy-MM-dd". */
  date: string;
  inflows: ForecastItem[];
  outflows: ForecastItem[];
  totalIn: number;
  totalOut: number;
  /** totalIn − totalOut. */
  net: number;
  /** Running cash position after this day's flows. */
  runningBalance: number;
};

export type ForecastWeek = {
  /** "yyyy-MM-dd" of the Monday (or first day) of the week. */
  weekStart: string;
  /** "yyyy-MM-dd" of the last day in the bucket (≤ 7 days). */
  weekEnd: string;
  totalIn: number;
  totalOut: number;
  net: number;
  /** Running balance at the end of this week. */
  endingBalance: number;
  /** Lowest running balance seen during this week. */
  minBalance: number;
};

export type ForecastSummary = {
  startingBalance: number;
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netCashflow: number;
  /** Minimum running balance across the entire horizon. */
  minBalance: number;
  minBalanceDate: string | null;
  /** Count of weeks where net cashflow < 0. */
  weeksWithDeficit: number;
  /** True when running balance dips below zero on any day. */
  hasInsolvencyRisk: boolean;
  /** CF-2 — count of open invoice/bill placements that were shifted
   *  by the learned payment-delay layer. Surfaces in the UI as
   *  "N items adjusted for typical payment delay". */
  patternsApplied: number;
};

export type CashflowForecast = {
  startDate: string;
  endDate: string;
  horizonDays: number;
  /** Currency code, e.g. "INR" — for display only. v1 assumes a single
   *  currency across all accounts (org default). */
  currency: string;
  days: ForecastDay[];
  weeks: ForecastWeek[];
  summary: ForecastSummary;
};
