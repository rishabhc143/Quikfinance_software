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
export default async function CashflowForecastPage() {
  const { organization } = await requireOrganization();
  const today = new Date();
  const forecast = await computeForecast(organization.id, today, 84, {
    currency: organization.currency,
  });

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
            scheduled payments, and active recurring profiles. Past-due
            items land on day 0. Predictive payment-delay learning and
            scenario planning ship in a follow-up phase.
          </p>
        </div>
      </div>
      <ForecastView forecast={forecast} />
    </div>
  );
}
