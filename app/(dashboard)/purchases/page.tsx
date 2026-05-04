import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Receipt, ShoppingBag, Repeat, Wallet, FileText, RotateCcw } from "lucide-react";

export const metadata = { title: "Purchases" };

const TILES = [
  { href: "/purchases/bills", label: "Bills", icon: FileText, complete: true },
  { href: "/purchases/expenses", label: "Expenses", icon: Receipt, complete: true },
  { href: "/purchases/orders", label: "Purchase Orders", icon: ShoppingBag, complete: true },
  { href: "/purchases/recurring-bills", label: "Recurring Bills", icon: Repeat, complete: true },
  { href: "/purchases/recurring-expenses", label: "Recurring Expenses", icon: Repeat, complete: true },
  { href: "/purchases/payments-made", label: "Payments Made", icon: Wallet, complete: true },
  { href: "/purchases/vendor-credits", label: "Vendor Credits", icon: RotateCcw, complete: true },
];

export default async function PurchasesPage() {
  const { organization } = await requireOrganization();
  const [billCount, expenseCount, openBills] = await Promise.all([
    db.bill.count({ where: { organizationId: organization.id, deletedAt: null } }),
    db.expense.count({ where: { organizationId: organization.id } }),
    db.bill.count({ where: { organizationId: organization.id, deletedAt: null, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } } }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Purchases</h1>
        <p className="text-sm text-muted-foreground">Bills, expenses, purchase orders, vendor payments, and credits.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Bills</div><div className="text-2xl font-semibold mt-1">{billCount}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Open bills</div><div className="text-2xl font-semibold mt-1">{openBills}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Expenses</div><div className="text-2xl font-semibold mt-1">{expenseCount}</div></CardContent></Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card className="hover:bg-muted/30 transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {t.label}
                    {!t.complete && <Badge variant="outline" className="ml-auto text-[10px]">Soon</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground flex items-center justify-between">
                  Open <ArrowRight className="h-3 w-3" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
