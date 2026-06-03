import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import {
  AlertTriangle,
  ArrowLeft,
  Package,
  TrendingDown,
} from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeStockValuation } from "@/lib/inventory/valuation";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Stock Valuation" };

export default async function StockValuationPage() {
  const { organization } = await requireOrganization();
  const summary = await computeStockValuation(organization.id);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <BackLink href="/reports"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Stock Valuation
          </h1>
          <p className="text-sm text-muted-foreground">
            Current on-hand stock valued at each item&apos;s standard cost
            price. Items without a cost price contribute zero — flag them
            in the table below.
          </p>
        </div>
      </div>

      {/* Top-line cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total inventory value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(summary.totalValue, organization.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalItems} tracked item
              {summary.totalItems === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Units on hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {summary.totalUnits.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              across all tracked items
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Below reorder point
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-amber-600">
              {summary.itemsBelowReorder}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.itemsOutOfStock > 0
                ? `${summary.itemsOutOfStock} out of stock`
                : "none out of stock"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Missing cost price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={
                "text-2xl font-semibold tabular-nums " +
                (summary.itemsMissingCost > 0
                  ? "text-destructive"
                  : "text-emerald-600")
              }
            >
              {summary.itemsMissingCost}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.itemsMissingCost > 0
                ? "valued at ₹0 — fix below"
                : "all items have a cost price"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Missing-cost warning banner */}
      {summary.itemsMissingCost > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm">
              <strong>
                {summary.itemsMissingCost} item
                {summary.itemsMissingCost === 1 ? "" : "s"} missing cost price.
              </strong>{" "}
              These contribute ₹0 to the total. Set a cost price in each
              item&apos;s settings so the valuation is accurate.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {summary.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Package
              className="h-12 w-12 mx-auto text-muted-foreground/50"
              strokeWidth={1.5}
            />
            <div>
              <h2 className="text-lg font-semibold">No tracked items yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enable &quot;Track Inventory&quot; on an item to see it
                here.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/items">Browse items</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Per-item breakdown</CardTitle>
            <div className="text-xs text-muted-foreground">
              Valuation method:{" "}
              <span className="font-mono">standard cost</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-4">Item</th>
                    <th className="py-2 px-4 text-right">On hand</th>
                    <th className="py-2 px-4 text-right">Cost price</th>
                    <th className="py-2 px-4 text-right">Value</th>
                    <th className="py-2 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row) => (
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
                        {row.currentStock.toFixed(2)}
                        {row.unit ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {row.unit}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {row.missingCost ? (
                          <span className="text-destructive inline-flex items-center gap-1">
                            <TrendingDown className="h-3.5 w-3.5" />
                            not set
                          </span>
                        ) : (
                          formatMoney(row.costPrice ?? 0, organization.currency)
                        )}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-semibold">
                        {formatMoney(row.value, organization.currency)}
                      </td>
                      <td className="py-2 px-4">
                        {row.status === "OUT" ? (
                          <Badge variant="destructive">Out</Badge>
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
                <tfoot>
                  <tr className="border-t-2 font-semibold bg-muted/30">
                    <td className="py-2 px-4">Total</td>
                    <td className="py-2 px-4 text-right tabular-nums">
                      {summary.totalUnits.toFixed(2)}
                    </td>
                    <td className="py-2 px-4"></td>
                    <td className="py-2 px-4 text-right tabular-nums">
                      {formatMoney(summary.totalValue, organization.currency)}
                    </td>
                    <td className="py-2 px-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
