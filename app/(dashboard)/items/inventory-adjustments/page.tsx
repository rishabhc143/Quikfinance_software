import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Boxes } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, PageHeader, EmptyState, type ColumnDef } from "@/components/shared/data-table";

export const metadata = { title: "Inventory Adjustments" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "item", header: "Item" },
  { key: "quantity", header: "Quantity", align: "right" },
  { key: "reason", header: "Reason" },
];

export default async function InventoryAdjustmentsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const sort = ["date", "quantity"].includes(searchParams.sort ?? "") ? searchParams.sort! : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where = { organizationId: organization.id } as const;

  const [total, rows] = await Promise.all([
    db.inventoryAdjustment.count({ where }),
    db.inventoryAdjustment.findMany({
      where, orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize, take: pageSize,
      include: { item: { select: { name: true, unit: true } } },
    }),
  ]);

  const dataRows = rows.map((a) => {
    const qty = Number(a.quantity);
    return {
      id: a.id,
      cells: [
        format(a.date, "dd MMM yyyy"),
        <span key="i" className="font-medium">{a.item.name}</span>,
        <span key="q" className={qty >= 0 ? "text-emerald-600 tabular-nums" : "text-destructive tabular-nums"}>
          {qty >= 0 ? "+" : ""}{qty.toFixed(2)}{a.item.unit ? ` ${a.item.unit}` : ""}
        </span>,
        <Badge key="r" variant="outline">{a.reason}</Badge>,
      ],
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/items"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <PageHeader title="Inventory Adjustments" ctaHref="/items/inventory-adjustments/new" ctaLabel="+ New Adjustment" />
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Adjust inventory levels"
          description="Record stock corrections, breakage, internal use, or count discrepancies. Each adjustment shifts an item's running quantity up or down."
          ctaHref="/items/inventory-adjustments/new"
          ctaLabel="+ Record adjustment"
        />
      ) : (
        <DataTable rows={dataRows} columns={COLUMNS} total={total} page={page} pageSize={pageSize} sort={sort} dir={dir} />
      )}
    </div>
  );
}
