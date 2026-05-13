import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1-30 days", min: 1, max: 30 },
  { label: "31-60 days", min: 31, max: 60 },
  { label: "61-90 days", min: 61, max: 90 },
  { label: "Over 90 days", min: 91, max: Infinity },
];

/** RPT-A — Receivables Aging CSV export. */
export async function GET() {
  const { organization } = await requireOrganization();
  const now = new Date();

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: { select: { displayName: true } } },
  });

  const byCustomer = new Map<
    string,
    { name: string; buckets: number[]; total: number }
  >();
  for (const inv of invoices) {
    const overdueDays = Math.floor(
      (now.getTime() - inv.dueDate.getTime()) / 86_400_000
    );
    const outstanding = Number(inv.total) - Number(inv.amountPaid);
    if (outstanding <= 0) continue;
    const bucketIndex = BUCKETS.findIndex(
      (b) => overdueDays >= b.min && overdueDays <= b.max
    );
    if (bucketIndex < 0) continue;
    const key = inv.contactId;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        name: inv.contact.displayName,
        buckets: BUCKETS.map(() => 0),
        total: 0,
      });
    }
    const row = byCustomer.get(key)!;
    row.buckets[bucketIndex] += outstanding;
    row.total += outstanding;
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);

  const csvRows: CsvRow[] = rows.map((r) => {
    const out: CsvRow = { customer: r.name };
    BUCKETS.forEach((b, i) => {
      out[b.label] = r.buckets[i];
    });
    out["total"] = r.total;
    return out;
  });

  const columns = ["customer", ...BUCKETS.map((b) => b.label), "total"];
  const csv = toCsv(csvRows, columns);
  return csvResponse(`ar-aging-${csvDateSuffix(now)}`, csv);
}
