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

/** RPT-A — Payables Aging CSV export. */
export async function GET() {
  const { organization } = await requireOrganization();
  const now = new Date();

  const bills = await db.bill.findMany({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: { select: { displayName: true } } },
  });

  const byVendor = new Map<
    string,
    { name: string; buckets: number[]; total: number }
  >();
  for (const b of bills) {
    const overdueDays = Math.floor(
      (now.getTime() - b.dueDate.getTime()) / 86_400_000
    );
    const outstanding = Number(b.total) - Number(b.amountPaid);
    if (outstanding <= 0) continue;
    const idx = BUCKETS.findIndex(
      (bk) => overdueDays >= bk.min && overdueDays <= bk.max
    );
    if (idx < 0) continue;
    const key = b.contactId;
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        name: b.contact.displayName,
        buckets: BUCKETS.map(() => 0),
        total: 0,
      });
    }
    const row = byVendor.get(key)!;
    row.buckets[idx] += outstanding;
    row.total += outstanding;
  }

  const rows = [...byVendor.values()].sort((a, b) => b.total - a.total);

  const csvRows: CsvRow[] = rows.map((r) => {
    const out: CsvRow = { vendor: r.name };
    BUCKETS.forEach((b, i) => {
      out[b.label] = r.buckets[i];
    });
    out["total"] = r.total;
    return out;
  });

  const columns = ["vendor", ...BUCKETS.map((b) => b.label), "total"];
  const csv = toCsv(csvRows, columns);
  return csvResponse(`ap-aging-${csvDateSuffix(now)}`, csv);
}
