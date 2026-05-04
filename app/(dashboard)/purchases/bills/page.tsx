import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Bills" };

function variant(s: string): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  if (s === "PAID") return "success";
  if (s === "OVERDUE" || s === "VOID") return "destructive";
  if (s === "PARTIALLY_PAID") return "warning";
  if (s === "DRAFT") return "secondary";
  return "default";
}

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "vendor", header: "Vendor" },
  { key: "status", header: "Status" },
  { key: "issueDate", header: "Issue", sortable: true },
  { key: "dueDate", header: "Due", sortable: true },
  { key: "total", header: "Total", sortable: true, align: "right" },
];

export default async function BillsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const status = searchParams.status;
  const sort = ["number", "issueDate", "dueDate", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.BillWhereInput = {
    organizationId: organization.id, deletedAt: null,
    ...(status && status !== "all" ? { status: status.toUpperCase() as Prisma.EnumBillStatusFilter } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { contact: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.bill.count({ where }),
    db.bill.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize, include: { contact: { select: { displayName: true } } } }),
  ]);

  const dataRows = rows.map((b) => ({
    id: b.id,
    href: `/purchases/bills/${b.id}`,
    cells: [
      <span key="n" className="font-mono">{b.number}</span>,
      b.contact.displayName,
      <Badge key="s" variant={variant(b.status)}>{b.status.replace("_", " ")}</Badge>,
      format(b.issueDate, "dd MMM yyyy"),
      format(b.dueDate, "dd MMM yyyy"),
      formatMoney(Number(b.total), cur),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Bills" ctaHref="/purchases/bills/new" ctaLabel="+ New Bill" />
      <div className="flex gap-1 text-xs">
        {["all", "DRAFT", "OPEN", "OVERDUE", "PAID", "VOID"].map((s) => (
          <Link key={s} href={`/purchases/bills${s === "all" ? "" : `?status=${s.toLowerCase()}`}`} className={`px-3 py-1 rounded-full ${(status ?? "all") === s.toLowerCase() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {s === "all" ? "All" : s.toLowerCase().replace("_", " ")}
          </Link>
        ))}
      </div>
      {total === 0 && !q && !status ? (
        <EmptyState title="No bills yet" description="Track what your business owes vendors and never miss a due date." ctaHref="/purchases/bills/new" ctaLabel="+ Create your first bill" />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
