import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import { buildCoaCsv, type CoaCsvRow } from "@/lib/accounting/coa-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ACCT-E.4 — Chart of Accounts CSV export.
 *
 * GET /accountant/chart-of-accounts/export?status=&q=&format=&decimal=
 *
 * Honors the same filters the list page exposes so what the user
 * sees on screen is what they get in the CSV. The `format` and
 * `decimal` params come from the export-dialog UI; CSV is the only
 * format wired for v1 (XLS/XLSX coming later).
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const url = req.nextUrl;

  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") ?? "").trim();
  // The format + decimal params arrive here when the dialog drives
  // the download. CSV is the only honored format today; XLS/XLSX
  // are reserved for a follow-up. Decimal formatting is reserved
  // for the future Balance column — CoA rows have no numeric
  // values today, so it doesn't affect the output yet.
  const format = url.searchParams.get("format") ?? "csv";
  if (format !== "csv") {
    return new Response(
      `Export format "${format}" not yet supported. Pick CSV for now.`,
      { status: 400 }
    );
  }

  const where: Prisma.ChartOfAccountWhereInput = {
    organizationId: organization.id,
    ...(status === "archived"
      ? { isActive: false }
      : status === "all"
        ? {}
        : { isActive: true }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { subType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const accounts = await db.chartOfAccount.findMany({
    where,
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true, code: true } },
    },
  });

  const rows: CoaCsvRow[] = accounts.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    subType: a.subType,
    parentName: a.parent?.name ?? null,
    parentCode: a.parent?.code ?? null,
    isActive: a.isActive,
    description: a.description,
  }));

  const csv = buildCoaCsv(rows);
  return csvResponse(
    `chart-of-accounts-${csvDateSuffix(new Date())}`,
    csv
  );
}
