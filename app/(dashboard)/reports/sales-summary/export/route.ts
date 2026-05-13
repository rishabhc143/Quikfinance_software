import { startOfYear } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";

/**
 * RPT-A — Sales Summary CSV export. Two sections in the file:
 * Top customers, then top items. Marker rows make the sections
 * visible when the CSV opens in Excel.
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(req.url);
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : startOfYear(new Date());
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : new Date();

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      issueDate: { gte: from, lte: to },
    },
    include: {
      contact: { select: { displayName: true } },
      lineItems: { include: { item: { select: { name: true } } } },
    },
  });

  const byCustomer = new Map<
    string,
    { name: string; total: number; count: number }
  >();
  const byItem = new Map<
    string,
    { name: string; revenue: number; quantity: number }
  >();

  for (const inv of invoices) {
    const t = Number(inv.total);
    const c = byCustomer.get(inv.contactId);
    if (c) {
      c.total += t;
      c.count++;
    } else {
      byCustomer.set(inv.contactId, {
        name: inv.contact.displayName,
        total: t,
        count: 1,
      });
    }

    for (const line of inv.lineItems) {
      const key = line.itemId ?? `__${line.description}`;
      const name = line.item?.name ?? line.description;
      const r = byItem.get(key);
      const lineTotal = Number(line.amount);
      const qty = Number(line.quantity);
      if (r) {
        r.revenue += lineTotal;
        r.quantity += qty;
      } else {
        byItem.set(key, { name, revenue: lineTotal, quantity: qty });
      }
    }
  }

  const customerRows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const itemRows = [...byItem.values()].sort((a, b) => b.revenue - a.revenue);

  const rows: CsvRow[] = [
    { section: "Customers", name: "(name)", quantity: "", count: "(invoices)", revenue: "(revenue)" },
    ...customerRows.map((r) => ({
      section: "Customer",
      name: r.name,
      quantity: "",
      count: r.count,
      revenue: r.total,
    })),
    { section: "", name: "", quantity: "", count: "", revenue: "" },
    { section: "Items", name: "(name)", quantity: "(qty)", count: "", revenue: "(revenue)" },
    ...itemRows.map((r) => ({
      section: "Item",
      name: r.name,
      quantity: r.quantity,
      count: "",
      revenue: r.revenue,
    })),
  ];

  const csv = toCsv(rows, ["section", "name", "quantity", "count", "revenue"]);
  return csvResponse(
    `sales-summary-${csvDateSuffix(from)}-${csvDateSuffix(to)}`,
    csv
  );
}
