/**
 * REPORTS — Server-safe helpers for the Report Basis dropdown.
 *
 * Lives in `lib/` (not `components/`) so server components can import
 * `parseReportBasis` and `REPORT_BASIS_LABEL` without crossing a
 * `"use client"` boundary. The client component
 * `components/reports/report-basis-dropdown.tsx` re-exports these
 * for places that import from the dropdown directly.
 *
 * Background: PR #167 deployed the regular `/reports/profit-loss`
 * page importing `parseReportBasis` from `report-basis-dropdown.tsx`.
 * That file has `"use client"` at the top — Next.js does not
 * reliably make non-component exports from client files available to
 * server consumers, and the production bundle resolved
 * `parseReportBasis` to `undefined`, throwing
 * `TypeError: (0, m.bb) is not a function` on first render
 * (digest `658706200`).
 */

export type ReportBasis = "accrual" | "cash";

export const REPORT_BASIS_LABEL: Record<ReportBasis, string> = {
  accrual: "Accrual",
  cash: "Cash",
};

export function parseReportBasis(
  searchParams: Record<string, string | undefined>
): ReportBasis {
  const raw = searchParams.basis;
  return raw === "cash" ? "cash" : "accrual";
}
