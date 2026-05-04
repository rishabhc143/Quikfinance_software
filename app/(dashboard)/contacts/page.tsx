import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";

export const metadata = { title: "Contacts" };

const COLUMNS: ColumnDef[] = [
  { key: "displayName", header: "Name", sortable: true },
  { key: "type", header: "Type" },
  { key: "companyName", header: "Company" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
];

export default async function ContactsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const q = (searchParams.q ?? "").trim();
  const sort = ["displayName", "createdAt", "type"].includes(searchParams.sort ?? "") ? searchParams.sort! : "displayName";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = [10, 25, 50, 100].includes(parseInt(searchParams.pageSize ?? "25", 10)) ? parseInt(searchParams.pageSize ?? "25", 10) : 25;

  const where: Prisma.ContactWhereInput = {
    organizationId: organization.id, deletedAt: null,
    ...(q ? { OR: [
      { displayName: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, displayName: true, type: true, email: true, phone: true, companyName: true },
    }),
  ]);

  const dataRows = rows.map((r) => ({
    id: r.id,
    href: `/contacts/${r.id}`,
    cells: [
      <span key="name" className="font-medium">{r.displayName}</span>,
      <Badge key="type" variant={r.type === "VENDOR" ? "outline" : r.type === "BOTH" ? "secondary" : "default"}>{r.type === "BOTH" ? "Customer + Vendor" : r.type.charAt(0) + r.type.slice(1).toLowerCase()}</Badge>,
      r.companyName ?? "—",
      r.email ?? "—",
      r.phone ?? "—",
    ],
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader title="Contacts" ctaHref="/contacts/new" ctaLabel="+ New Contact" />
      {total === 0 && !q ? (
        <EmptyState
          title="Customers and vendors live here."
          description="Track who you sell to and who you buy from. Used by every invoice, bill, and payment in Quikfinance."
          ctaHref="/contacts/new" ctaLabel="+ Add your first contact"
        />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} search={q} />
      )}
    </div>
  );
}
