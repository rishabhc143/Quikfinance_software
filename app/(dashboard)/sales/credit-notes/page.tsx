import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Credit Notes" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "date", header: "Date", sortable: true },
  { key: "total", header: "Amount", sortable: true, align: "right" },
];

export default async function CreditNotesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["number", "date", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.CreditNoteWhereInput = {
    organizationId: organization.id,
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.creditNote.count({ where }),
    db.creditNote.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((c) => ({
    id: c.id,
    cells: [
      <span key="n" className="font-mono">{c.number}</span>,
      c.contact.displayName,
      format(c.date, "dd MMM yyyy"),
      formatMoney(Number(c.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Credit Notes" ctaHref="/sales/credit-notes/new" ctaLabel="+ New Credit Note" />
      {total === 0 && !q ? (
        <EmptyState title="No credit notes yet" description="Issue refunds and adjustments against invoiced amounts." ctaHref="/sales/credit-notes/new" ctaLabel="+ Create credit note" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
