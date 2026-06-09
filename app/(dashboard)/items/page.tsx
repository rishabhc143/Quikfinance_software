import Link from "next/link";
import { Plus } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ItemsTable } from "./items-table";
import { ItemsTableActions } from "./table-actions";
import { ITEM_SORT_FIELDS, type ItemSortField } from "@/lib/validations/item";

export const metadata = { title: "Items" };

type SearchParams = {
  q?: string;
  status?: "all" | "active" | "inactive";
  sort?: ItemSortField;
  dir?: "asc" | "desc";
  page?: string;
  pageSize?: string;
};

export default async function ItemsPage({ searchParams }: { searchParams: SearchParams }) {
  const { organization } = await requireOrganization();

  const status = searchParams.status ?? "all";
  const q = (searchParams.q ?? "").trim();
  const sort = (ITEM_SORT_FIELDS as readonly string[]).includes(searchParams.sort ?? "")
    ? (searchParams.sort as ItemSortField)
    : "name";
  const dir = searchParams.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = [25, 50, 100].includes(parseInt(searchParams.pageSize ?? "25", 10))
    ? parseInt(searchParams.pageSize ?? "25", 10)
    : 25;

  const where: Prisma.ItemWhereInput = {
    organizationId: organization.id,
    deletedAt: null,
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(q.length > 0
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { salesDescription: { contains: q, mode: "insensitive" } },
            { purchaseDescription: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ItemOrderByWithRelationInput = { [sort]: dir };

  const [total, rows] = await Promise.all([
    db.item.count({ where }),
    db.item.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-1">
            {status === "all" ? "All Items" : status === "active" ? "Active Items" : "Inactive Items"}
            <span className="text-muted-foreground">▾</span>
          </h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} items</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/items/new"><Plus className="h-4 w-4 mr-1" /> New</Link>
          </Button>
          <ItemsTableActions />
        </div>
      </header>

      <ItemsTable
        rows={rows.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          purchaseDescription: r.purchaseDescription,
          purchaseRate: r.costPrice ? Number(r.costPrice) : null,
          salesDescription: r.salesDescription,
          sellingPrice: r.sellingPrice ? Number(r.sellingPrice) : null,
          unit: r.unit,
          isActive: r.isActive,
        }))}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        currency={organization.currency}
        emptyState={total === 0 && q.length === 0 && status === "all"}
      />
    </div>
  );
}
