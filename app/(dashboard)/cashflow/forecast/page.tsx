import { TrendingUp } from "lucide-react";
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
  searchParams?: { stressDays?: string };
}) {
  const { organization } = await requireOrganization();
  const today = new Date();
  const stressDays = parseStressDays(searchParams?.stressDays);

  const forecast = await computeForecast(organization.id, today, 84, {
    currency: organization.currency,
    stressDays,
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
      <ForecastView
        forecast={forecast}
        baseForecast={baseForecast}
        stressOptions={STRESS_OPTIONS as unknown as number[]}
      />
    </div>
  );
}
