import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Customer export. Two modes:
 *  - mode=all          → every non-deleted customer (cap 25,000)
 *  - mode=current_view → respects q/sort/dir/view (cap 10,000)
 *
 * Format: csv (default) | xlsx (Phase S8 — falls back to csv for now)
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") === "current_view" ? "current_view" : "all";
  const format = sp.get("format") === "xlsx" ? "xlsx" : "csv";
  const q = sp.get("q")?.trim() ?? "";
  const view = sp.get("view") ?? "all";
  const cap = mode === "all" ? 25_000 : 10_000;

  const where = {
    organizationId: organization.id,
    type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
    deletedAt: null,
    ...(view === "active" ? { isInactive: false } : {}),
    ...(view === "inactive" ? { isInactive: true } : {}),
    ...(mode === "current_view" && q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { companyName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { workPhone: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const customers = await db.contact.findMany({
    where,
    take: cap,
    orderBy: { displayName: "asc" },
    select: {
      displayName: true,
      companyName: true,
      email: true,
      workPhone: true,
      mobile: true,
      gstin: true,
      pan: true,
      currency: true,
      firstName: true,
      lastName: true,
      salutation: true,
      placeOfSupply: true,
      gstTreatment: true,
      isInactive: true,
      notes: true,
    },
  });

  const records = customers.map((c) => ({
    displayName: c.displayName,
    companyName: c.companyName ?? "",
    email: c.email ?? "",
    workPhone: c.workPhone ?? "",
    mobile: c.mobile ?? "",
    gstin: c.gstin ?? "",
    pan: c.pan ?? "",
    currency: c.currency ?? organization.currency,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    salutation: c.salutation ?? "",
    placeOfSupply: c.placeOfSupply ?? "",
    gstTreatment: c.gstTreatment ?? "",
    isInactive: c.isInactive ? "true" : "false",
    notes: c.notes ?? "",
  }));

  // XLSX export pending — Phase S8 swaps in exceljs. CSV is the v1 path.
  void format;

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfinance-customers-${mode}-${Date.now()}.csv"`,
    },
  });
}
