import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Recurring Invoices" };

const COLUMNS: ColumnDef[] = [
  { key: "profileName", header: "Profile", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "frequency", header: "Frequency" },
  { key: "nextRunAt", header: "Next run", sortable: true },
  { key: "amount", header: "Amount", align: "right" },
  { key: "isActive", header: "Active" },
];

export default async function RecurringInvoicesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["profileName", "nextRunAt"].includes(searchParams.sort ?? "") ? searchParams.sort! : "nextRunAt";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.RecurringInvoiceWhereInput = {
    organizationId: organization.id,
    ...(q ? { profileName: { contains: q, mode: "insensitive" } } : {}),
  };

  const [total, rows] = await Promise.all([
    db.recurringInvoice.count({ where }),
    db.recurringInvoice.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((r) => ({
    id: r.id,
    cells: [
      <span key="p" className="font-medium">{r.profileName}</span>,
      r.contact.displayName,
      <Badge key="f" variant="outline">{r.frequency}</Badge>,
      format(r.nextRunAt, "dd MMM yyyy"),
      formatMoney(Number(r.amount), organization.currency),
      r.isActive ? <Badge key="a" variant="success">Active</Badge> : <Badge key="a" variant="secondary">Paused</Badge>,
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Recurring Invoices" ctaHref="/sales/recurring-invoices/new" ctaLabel="+ New Profile" />
      {total === 0 && !q ? (
        <EmptyState title="Auto-generate invoices on a schedule" description="Set it once, Quikfinance creates the invoice every cycle. The runner that actually fires the invoices is queued for a future release; the schedule is recorded today." ctaHref="/sales/recurring-invoices/new" ctaLabel="+ Create profile" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
