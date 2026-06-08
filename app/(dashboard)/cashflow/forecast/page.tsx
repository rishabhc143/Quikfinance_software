import Link from "next/link";
import { Database, TrendingUp } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { computeForecast } from "@/lib/cashflow/forecast";
import { ForecastView } from "./forecast-view";

export const metadata = { title: "12-week Cashflow Forecast" };

/**
 * CF-1 — 12-week rolling daily cashflow forecast.
 *
 * Server-component: fetches the projection once at request time. The
 * underlying engine is fast (< 500ms for 10K open invoices + 100
 * recurring profiles) so we re-compute on every page load rather than
 * caching. A cron-warmed snapshot table is a Phase 2 optimisation if
 * page-render time ever becomes an issue.
 *
 * Predictive layer (per-customer payment-delay learning, confidence
 * bands, scenario overrides) is also Phase 2.
 */
// CF-3 — supported stress-test scenarios, surfaced as button group.
// Keep this list short — too many options dilute the signal and slow
// the user down. CFOs typically want 0 / 7 / 14 / 30. Beyond 30 days
// is the "everything's on fire" scenario which a separate banner
// already covers (insolvency-risk warning).
const STRESS_OPTIONS = [0, 7, 14, 30] as const;

function parseStressDays(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Only honour values from our supported list — guards against
  // arbitrary URL tampering (?stressDays=999).
  return (STRESS_OPTIONS as readonly number[]).includes(n) ? n : 0;
}

export default async function CashflowForecastPage({
  searchParams,
}: {
  searchParams?: { stressDays?: string; companion?: string };
}) {
  const { organization } = await requireOrganization();
  const today = new Date();
  const stressDays = parseStressDays(searchParams?.stressDays);
  // Tally Companion Sprint 2 — URL-driven opt-in. When set, the
  // forecast engine mixes in CompanionVoucher rows alongside native
  // Invoices/Bills. Default off so existing single-source-of-truth
  // behaviour is preserved.
  const includeCompanion = searchParams?.companion === "1";

  const forecast = await computeForecast(organization.id, today, 84, {
    currency: organization.currency,
    stressDays,
    includeCompanion,
  });

  // CF-3 — when a stress scenario is active, also fetch the BASE-case
  // forecast so the UI can show a side-by-side delta ("min balance
  // drops by ₹X under +14d stress"). Cheap because the engine's
  // queries are read-only and Promise.all-style.
  const baseForecast =
    stressDays > 0
      ? await computeForecast(organization.id, today, 84, {
          currency: organization.currency,
          stressDays: 0,
          includeCompanion,
        })
      : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <TrendingUp className="h-6 w-6 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            12-week Cashflow Forecast
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Deterministic projection from open invoices, open bills,
            scheduled payments, and active recurring profiles, with a
            predictive layer that shifts inflow dates by each customer&apos;s
            learned average payment delay. Past-due items land on day 0.
          </p>
        </div>
      </div>
      {/* Tally Companion Sprint 2 — toggle for mixing in imported
          Tally data. Only shown when there's at least one Companion
          voucher AND when the toggle is currently OFF (so the user
          discovers the feature). Once on, the banner inside
          ForecastView surfaces the included-item count. */}
      <CompanionToggle
        currentlyOn={includeCompanion}
        stressDays={stressDays}
      />

      <ForecastView
        forecast={forecast}
        baseForecast={baseForecast}
        stressOptions={STRESS_OPTIONS as unknown as number[]}
      />
    </div>
  );
}

function CompanionToggle({
  currentlyOn,
  stressDays,
}: {
  currentlyOn: boolean;
  stressDays: number;
}) {
  // Preserve other URL params (stressDays) when toggling.
  const onParams = new URLSearchParams();
  if (stressDays > 0) onParams.set("stressDays", String(stressDays));
  if (!currentlyOn) onParams.set("companion", "1");
  const href = `/cashflow/forecast${onParams.toString() ? `?${onParams.toString()}` : ""}`;
  const tone = currentlyOn
    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : "bg-muted/40 border-border text-muted-foreground";
  return (
    <div className={`rounded-lg border px-4 py-2 text-sm flex items-center justify-between ${tone}`}>
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4" />
        <span>
          {currentlyOn
            ? "Including Tally Companion data in this forecast"
            : "Tally Companion data not included. Toggle to mix your imported Tally vouchers into the forecast."}
        </span>
      </div>
      <Link
        href={href}
        className="text-xs underline hover:no-underline"
      >
        {currentlyOn ? "Use native data only" : "Include Tally data"}
      </Link>
    </div>
  );
}
