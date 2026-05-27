import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth-helpers";
import { findReport } from "@/lib/reports/catalog";
import { CustomReportWizard } from "../custom-report-wizard";

export const metadata = { title: "Create Custom Report" };

/**
 * REPORTS — "Create Custom Report" wizard entry page.
 *
 * Reached from the Reports Center modal: the user picks a base report
 * and clicks Proceed, which navigates here with `?base=<reportKey>`.
 * We resolve that key against the static catalog and hand off to the
 * client wizard. Missing/unknown base → bounce back to /reports.
 *
 * `requireOrganization()` gates access (auth + org scope) even though
 * the General step's controls are static-option dropdowns.
 */
export default async function NewCustomReportPage({
  searchParams,
}: {
  searchParams?: { base?: string };
}) {
  await requireOrganization();

  const base = searchParams?.base ? findReport(searchParams.base) : undefined;
  if (!base) {
    redirect("/reports");
  }

  return (
    <CustomReportWizard
      baseKey={base.key}
      baseName={base.name}
      baseHref={base.href ?? null}
    />
  );
}
