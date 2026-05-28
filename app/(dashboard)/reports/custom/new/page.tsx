import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { findReport } from "@/lib/reports/catalog";
import { buildCustomReportStructure } from "@/lib/reports/custom-report-structure";
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
 * For P&L-family bases we also load the org's Chart of Accounts and
 * build the Step 2 ("Customize Rows and Columns") structural tree:
 * accounts grouped into the standard P&L sections, interleaved with the
 * formula subtotal rows. `buildCustomReportStructure` returns `null` for
 * report types without a structure editor yet — the wizard then shows a
 * "coming soon" message. The COA read is fail-open: any error just
 * yields `structure = null` so the wizard still renders and navigates.
 *
 * `requireOrganization()` gates access (auth + org scope).
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

  let structure: ReturnType<typeof buildCustomReportStructure> = null;
  try {
    const accounts = await db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    });
    structure = buildCustomReportStructure(
      base.key,
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        type: String(a.type),
      })),
    );
  } catch {
    structure = null;
  }

  return (
    <CustomReportWizard
      baseKey={base.key}
      baseName={base.name}
      baseHref={base.href ?? null}
      structure={structure}
      orgName={organization.name}
    />
  );
}
