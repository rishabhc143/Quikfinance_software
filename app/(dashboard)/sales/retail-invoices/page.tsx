import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Retail Invoices" };

const COLUMNS: ColumnDef[] = [
  { key: "number", header: "Number", sortable: true },
  { key: "customer", header: "Customer / Note" },
  { key: "issueDate", header: "Date", sortable: true },
  { key: "status", header: "Status" },
  { key: "total", header: "Total", sortable: true, align: "right" },
];

export default async function RetailInvoicesPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const sort = ["number", "issueDate", "total"].includes(searchParams.sort ?? "") ? searchParams.sort! : "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where = {
    organizationId: organization.id, deletedAt: null, isRetail: true,
  } as const;

  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  const dataRows = rows.map((i) => ({
    id: i.id,
    href: `/sales/invoices/${i.id}`,
    cells: [
      <span key="n" className="font-mono">{i.number}</span>,
      <span key="c" className="truncate inline-block max-w-[300px]">{i.notes ?? "—"}</span>,
      format(i.issueDate, "dd MMM yyyy"),
      <Badge key="s" variant="success">Paid</Badge>,
      formatMoney(Number(i.total), organization.currency),
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Retail Invoices" ctaHref="/sales/retail-invoices/new" ctaLabel="+ New Retail Invoice" />
      {total === 0 ? (
        <EmptyState
          title="Cash sales at the counter"
          description="Walk-in retail sales — no contact needed, paid on the spot. Quikfinance creates a paid invoice tagged as retail."
          ctaHref="/sales/retail-invoices/new"
          ctaLabel="+ Record retail sale"
        />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} />
      )}
    </div>
  );
}
