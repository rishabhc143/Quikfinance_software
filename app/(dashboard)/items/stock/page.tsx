import Link from "next/link";
import { ArrowLeft, AlertTriangle, Package, Plus } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeStockLevels } from "@/lib/inventory/stock-levels";

export const metadata = { title: "Stock Levels" };

type SearchParams = { filter?: "low" | "all" };

export default async function StockLevelsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const all = await computeStockLevels(organization.id);
  const filter = searchParams.filter === "low" ? "low" : "all";
  const shown = filter === "low" ? all.filter((r) => r.status !== "OK") : all;

  const lowCount = all.filter((r) => r.status !== "OK").length;
  const outCount = all.filter((r) => r.status === "OUT").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/items">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Stock Levels</h1>
          <p className="text-sm text-muted-foreground">
            Current on-hand stock for every item with inventory tracking
            enabled.
          </p>
        </div>
        <Button asChild className="gap-1">
          <Link href="/items/inventory-adjustments/new">
            <Plus className="h-4 w-4" /> Adjustment
          </Link>
        </Button>
      </div>

      {/* Reorder alerts */}
      {lowCount > 0 ? (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {lowCount} item{lowCount === 1 ? "" : "s"} need attention
                {outCount > 0 ? ` (${outCount} out of stock)` : ""}.
              </div>
              <div className="text-xs text-muted-foreground">
                Items where current stock is at or below the reorder point,
                or zero.
              </div>
            </div>
            {filter !== "low" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/items/stock?filter=low">Show only these</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/items/stock">Show all</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Package
              className="h-12 w-12 mx-auto text-muted-foreground/50"
              strokeWidth={1.5}
            />
            <div>
              <h2 className="text-lg font-semibold">
                {filter === "low" ? "Nothing low" : "No tracked items yet"}
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {filter === "low"
                  ? "Every tracked item is above its reorder point."
                  : "Enable 'Track Inventory' on an item to see its stock here."}
              </p>
            </div>
            {filter === "all" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/items">Browse items</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {filter === "low" ? "Low / out of stock" : "All tracked items"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {shown.length} of {all.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-4">Item</th>
                    <th className="py-2 px-4 text-right">Opening</th>
                    <th className="py-2 px-4 text-right">Net adjustments</th>
                    <th className="py-2 px-4 text-right">Current</th>
                    <th className="py-2 px-4 text-right">Reorder at</th>
                    <th className="py-2 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="py-2 px-4">
                        <Link
                          href={`/items/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.sku ? (
                          <span className="ml-2 text-xs text-muted-foreground font-mono">
                            {row.sku}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {row.openingStock.toFixed(2)}
                        {row.unit ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {row.unit}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        <span
                          className={
                            row.totalAdjustment < 0
                              ? "text-destructive"
                              : row.totalAdjustment > 0
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                          }
                        >
                          {row.totalAdjustment >= 0 ? "+" : ""}
                          {row.totalAdjustment.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {row.currentStock.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                        {row.reorderPoint !== null
                          ? row.reorderPoint.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-2 px-4">
                        {row.status === "OUT" ? (
                          <Badge variant="destructive">Out of stock</Badge>
                        ) : row.status === "LOW" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-400 text-amber-700 dark:text-amber-400"
                          >
                            Low
                          </Badge>
                        ) : (
                          <Badge variant="secondary">In stock</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
