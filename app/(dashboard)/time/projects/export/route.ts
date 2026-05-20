import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { toCsv, csvResponse, csvDateSuffix } from "@/lib/reports/csv-export";
import { billingMethodLabel } from "../constants";

/**
 * CSV export of Projects. Honours the same `status`/`q` URL filters as
 * the list page, so "Export Current View" produces a file that matches
 * what the user sees on screen.
 *
 * `?status=active|inactive|completed|cancelled` — filter by status
 * `?q=<text>`                                 — name contains text
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const status = (searchParams.get("status") ?? "all").toLowerCase();
  const VALID = new Set(["active", "inactive", "completed", "cancelled"]);

  const where: Prisma.ProjectWhereInput = {
    organizationId: organization.id,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(VALID.has(status) ? { status } : {}),
  };

  const rows = await db.project.findMany({
    where,
    orderBy: { name: "asc" },
  });

  // Hydrate customer names for the rows we have.
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])
  );
  const customers =
    customerIds.length > 0
      ? await db.contact.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, displayName: true },
        })
      : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.displayName]));

  const csvRows = rows.map((p) => ({
    "Project Name": p.name,
    "Project Code": p.projectCode ?? "",
    "Customer Name": p.customerId ? customerMap.get(p.customerId) ?? "" : "",
    "Status": p.status,
    "Billing Method": billingMethodLabel(p.billingMethod),
    "Description": p.description ?? "",
    "Cost Budget": p.budget ? Number(p.budget).toFixed(2) : "",
    "Revenue Budget": p.revenueBudget ? Number(p.revenueBudget).toFixed(2) : "",
    "Start Date": p.startDate ? format(p.startDate, "yyyy-MM-dd") : "",
    "End Date": p.endDate ? format(p.endDate, "yyyy-MM-dd") : "",
    "Created At": format(p.createdAt, "yyyy-MM-dd"),
  }));

  const csv = toCsv(csvRows, [
    "Project Name",
    "Project Code",
    "Customer Name",
    "Status",
    "Billing Method",
    "Description",
    "Cost Budget",
    "Revenue Budget",
    "Start Date",
    "End Date",
    "Created At",
  ]);

  const suffix = csvDateSuffix(new Date());
  const filename = status === "all" && !q
    ? `projects-${suffix}`
    : `projects-${status === "all" ? "filtered" : status}-${suffix}`;

  return csvResponse(filename, csv);
}
