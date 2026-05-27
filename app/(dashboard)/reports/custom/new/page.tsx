import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { findReport } from "@/lib/reports/catalog";
import { CustomReportWizard } from "../custom-report-wizard";

export const metadata = { title: "Create Custom Report" };

/**
 * REPORTS — "Create Custom Report" wizard entry page.
 *
 * Reached from the Reports Center modal: the user picks a base report
 * and clicks Proceed, which navigates here with `?base=<reportKey>`.
 * We resolve that key against the static catalog, pre-fetch the org's
 * Chart of Accounts for the Filter Accounts dropdown, and hand off to
 * the client wizard. Missing/unknown base → bounce back to /reports.
 */
export default async function NewCustomReportPage({
  searchParams,
}: {
  searchParams?: { base?: string };
}) {
  const { organization } = await requireOrganization();

  const base = searchParams?.base ? findReport(searchParams.base) : undefined;
  if (!base) {
    redirect("/reports");
  }

  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return (
    <CustomReportWizard
      baseKey={base.key}
      baseName={base.name}
      baseHref={base.href ?? null}
      accountOptions={accounts.map((a) => ({
        value: a.id,
        label: a.code ? `${a.code} — ${a.name}` : a.name,
      }))}
    />
  );
}
