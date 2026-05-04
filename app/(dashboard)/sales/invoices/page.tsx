import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";

export const metadata = { title: "Invoices" };

function statusVariant(s: string): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  if (s === "PAID") return "success";
  if (s === "OVERDUE" || s === "VOID") return "destructive";
  if (s === "PARTIALLY_PAID") return "warning";
  if (s === "DRAFT") return "secondary";
  return "default";
}

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "contactName", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "issueDate", header: "Issue", sortable: true },
  { key: "dueDate", header: "Due", sortable: true },
  { key: "total", header: "Total", sortable: true, align: "right" },
  { key: "amountPaid", header: "Paid", align: "right" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const status = searchParams.status;
  const sort = ["number", "issueDate", "dueDate", "total", "status"].includes(searchParams.sort ?? "") ? searchParams.sort! : "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = [10, 25, 50, 100].includes(parseInt(searchParams.pageSize ?? "25", 10)) ? parseInt(searchParams.pageSize ?? "25", 10) : 25;

  const where: Prisma.InvoiceWhereInput = {
    organizationId: organization.id, deletedAt: null,
    ...(status && status !== "all" ? { status: status.toUpperCase() as Prisma.EnumInvoiceStatusFilter } : {}),
    ...(q ? { OR: [
      { number: { contains: q, mode: "insensitive" } },
      { contact: { displayName: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((i) => ({
    id: i.id,
    href: `/sales/invoices/${i.id}`,
    cells: [
      <span key="num" className="font-medium font-mono">{i.number}</span>,
      i.contact.displayName,
      <Badge key="s" variant={statusVariant(i.status)}>{i.status.replace("_", " ")}</Badge>,
      format(i.issueDate, "dd MMM yyyy"),
      format(i.dueDate, "dd MMM yyyy"),
      formatMoney(Number(i.total), cur),
      formatMoney(Number(i.amountPaid), cur),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Invoices" ctaHref="/sales/invoices/new" ctaLabel="+ New Invoice" />
      <div className="flex gap-1 text-xs">
        {["all", "DRAFT", "SENT", "OVERDUE", "PAID", "VOID"].map((s) => (
          <Link key={s} href={`/sales/invoices${s === "all" ? "" : `?status=${s.toLowerCase()}`}`} className={`px-3 py-1 rounded-full ${(status ?? "all") === s.toLowerCase() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {s === "all" ? "All" : s.toLowerCase().replace("_", " ")}
          </Link>
        ))}
      </div>
      {total === 0 && !q && !status ? (
        <EmptyState title="No invoices yet" description="Send a polished invoice to a customer in seconds. We'll track payments and overdue automatically." ctaHref="/sales/invoices/new" ctaLabel="+ Create your first invoice" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
