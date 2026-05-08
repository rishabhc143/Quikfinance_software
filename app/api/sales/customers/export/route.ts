import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  parseExportOptions,
  writeExportResponse,
} from "@/lib/sales/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer export. M29: now honours format=xlsx + decimalFormat +
 * includePii + password. PII gating drops email / phone / mobile
 * columns when unchecked. Status filter maps to isInactive boolean
 * + portal-enabled view.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const sp = req.nextUrl.searchParams;
  const rawMode = sp.get("mode");
  const mode =
    rawMode === "selected"
      ? "selected"
      : rawMode === "current_view"
      ? "current_view"
      : "all";
  const q = sp.get("q")?.trim() ?? "";
  const view = sp.get("view") ?? "all";
  const idsParam = sp.get("ids") ?? "";
  const ids =
    mode === "selected"
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000)
      : [];
  const cap = mode === "all" ? 25_000 : mode === "current_view" ? 10_000 : 1_000;

  const opts = parseExportOptions(sp);

  // M29: status here maps to a few different filters per the
  // SavedView shape — "active" / "inactive" / "portal_enabled".
  let statusFilter: Record<string, unknown> = {};
  const status = opts.status || view;
  if (status === "active") statusFilter = { isInactive: false };
  else if (status === "inactive") statusFilter = { isInactive: true };
  else if (status === "portal_enabled") statusFilter = { enablePortal: true };

  const where = {
    organizationId: organization.id,
    type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
    deletedAt: null,
    ...(mode === "selected" ? { id: { in: ids } } : {}),
    ...statusFilter,
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
    email: opts.includePii ? c.email ?? "" : "",
    workPhone: opts.includePii ? c.workPhone ?? "" : "",
    mobile: opts.includePii ? c.mobile ?? "" : "",
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

  return writeExportResponse(opts, records, "customers", mode);
}
