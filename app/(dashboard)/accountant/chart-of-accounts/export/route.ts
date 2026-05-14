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
 * GET /accountant/chart-of-accounts/export?status=&q=
 *
 * Honors the same filters the list page exposes so what the user
 * sees on screen is what they get in the CSV.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const url = req.nextUrl;

  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") ?? "").trim();

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
