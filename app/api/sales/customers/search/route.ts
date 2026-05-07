import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * Full-text contact search used by the search-magnifier button on
 * transaction forms (per <quotes_spec>: "Search-magnifier button right
 * of the combobox triggers full-text contact search").
 *
 *   GET /api/sales/customers/search?q=...
 *
 * Returns up to 25 contacts matching displayName / companyName / email /
 * phone (case-insensitive).
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ results: [] });

  const rows = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { workPhone: { contains: q, mode: "insensitive" } },
        { mobile: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 25,
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      email: true,
      workPhone: true,
    },
  });

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      companyName: r.companyName,
      email: r.email,
      phone: r.workPhone,
    })),
  });
}
