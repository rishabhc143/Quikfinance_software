import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const limit = scope === "view" ? 10_000 : 25_000;

  const where: Prisma.ItemWhereInput = { organizationId: organization.id, deletedAt: null };

  if (scope === "view") {
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim() ?? "";
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { salesDescription: { contains: q, mode: "insensitive" } },
        { purchaseDescription: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  const items = await db.item.findMany({ where, orderBy: { name: "asc" }, take: limit });
  const rows = items.map((i) => ({
    Name: i.name,
    SKU: i.sku ?? "",
    Type: i.type,
    Unit: i.unit ?? "",
    "Selling Price": i.sellingPrice?.toString() ?? "",
    "Sales Description": i.salesDescription ?? "",
    "Cost Price": i.costPrice?.toString() ?? "",
    "Purchase Description": i.purchaseDescription ?? "",
    Status: i.isActive ? "Active" : "Inactive",
    "Track Inventory": i.trackInventory ? "Yes" : "No",
    "Created At": i.createdAt.toISOString(),
  }));

  const filename = `quikfinance-items-${new Date().toISOString().slice(0, 10)}.${format === "xlsx" ? "xlsx" : "csv"}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Items");
    if (rows.length > 0) {
      ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 22 }));
      ws.addRows(rows);
      ws.getRow(1).font = { bold: true };
    } else {
      ws.addRow(["No data"]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const csv = stringify(rows, { header: true });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
