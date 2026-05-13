import { format } from "date-fns";
import {
  Activity,
  Sparkles,
  Eye,
  Link2,
  AlertCircle,
  Copy,
  Calendar,
  CheckCircle2,
  GitBranch,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { BankAccountStats } from "@/lib/banking/account-stats";

/**
 * BNK-B — Per-account dashboard tiles.
 *
 * Pure presentational React Server Component. Six metric tiles +
 * three header strips (latest statement / last reconciliation /
 * active rules). Layout mirrors Zoho's "Latest Statement Details"
 * panel.
 *
 * Each tile gets a hue that maps to the action the user might take:
 *   - emerald → no action needed (auto handled)
 *   - blue    → user took action recently
 *   - amber   → action needed
 *   - muted   → informational only
 */

type TileTone = "neutral" | "emerald" | "blue" | "amber" | "muted";

const TONE_CLASSES: Record<TileTone, { value: string; label: string }> = {
  neutral: { value: "text-foreground", label: "text-muted-foreground" },
  emerald: {
    value: "text-emerald-700 dark:text-emerald-400",
    label: "text-emerald-700/70 dark:text-emerald-400/70",
  },
  blue: {
    value: "text-blue-700 dark:text-blue-400",
    label: "text-blue-700/70 dark:text-blue-400/70",
  },
  amber: {
    value: "text-amber-700 dark:text-amber-400",
    label: "text-amber-700/70 dark:text-amber-400/70",
  },
  muted: {
    value: "text-muted-foreground",
    label: "text-muted-foreground",
  },
};

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Activity;
  tone?: TileTone;
  hint?: string;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-1" title={hint}>
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${t.label}`} />
          <span className={`text-[11px] font-medium uppercase tracking-wider ${t.label}`}>
            {label}
          </span>
        </div>
        <div className={`text-2xl font-semibold tabular-nums ${t.value}`}>
          {value}
        </div>
        {sub ? (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {sub}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StatTiles({
  stats,
  openingBalance,
  currency,
}: {
  stats: BankAccountStats;
  openingBalance: number;
  currency: string;
}) {
  const { total } = stats;
  return (
    <div className="space-y-3">
      {/* Header strip — three metadata facts, comma-separated */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          Latest statement:{" "}
          <span className="text-foreground font-medium">
            {stats.latestStatementAt
              ? format(stats.latestStatementAt, "dd MMM yyyy")
              : "—"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {stats.lastReconciledAt ? (
            <>
              Last reconciled:{" "}
              <span className="text-foreground font-medium">
                {format(stats.lastReconciledAt, "dd MMM yyyy")}
              </span>
            </>
          ) : (
            <span className="italic">Never reconciled</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium tabular-nums">
            {stats.activeRulesCount}
          </span>{" "}
          active rule{stats.activeRulesCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5 ml-auto">
          Opening balance:{" "}
          <span className="text-foreground font-medium tabular-nums">
            {formatMoney(openingBalance, currency)}
          </span>
        </span>
      </div>

      {/* Six tiles */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Total"
          value={total}
          sub="100%"
          icon={Activity}
          tone="neutral"
        />
        <Tile
          label="Autocategorised"
          value={stats.autocategorised}
          sub={pct(stats.autocategorised, total)}
          icon={Sparkles}
          tone="emerald"
          hint="Bank lines a Transaction Rule fired on during import."
        />
        <Tile
          label="Recognised"
          value={stats.recognised}
          sub="—"
          icon={Eye}
          tone="muted"
          hint="Reserved for BNK-E.2: rule fired but needs user confirmation."
        />
        <Tile
          label="Best Matches"
          value={stats.bestMatches}
          sub={pct(stats.bestMatches, total)}
          icon={Link2}
          tone="blue"
          hint="Bank lines you matched manually to an existing record or Categorised by hand."
        />
        <Tile
          label="Uncategorised"
          value={stats.uncategorised}
          sub={pct(stats.uncategorised, total)}
          icon={AlertCircle}
          tone="amber"
          hint="Unmatched, non-excluded rows waiting on you."
        />
        <Tile
          label="Duplicates"
          value={stats.duplicates}
          sub={pct(stats.duplicates, total)}
          icon={Copy}
          tone="muted"
          hint="Rows flagged as duplicates during import."
        />
      </div>
    </div>
  );
}
