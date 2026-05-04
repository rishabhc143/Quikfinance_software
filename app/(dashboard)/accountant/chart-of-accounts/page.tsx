import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export const metadata = { title: "Chart of Accounts" };

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

export default async function ChartOfAccountsPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id },
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
  });

  const grouped = accounts.reduce<Record<string, typeof accounts>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} accounts across {Object.keys(grouped).length} categories</p>
        </div>
        <Button asChild><Link href="/accountant/chart-of-accounts/new"><Plus className="h-4 w-4 mr-1" /> New Account</Link></Button>
      </div>

      {Object.entries(grouped).map(([type, list]) => (
        <Card key={type}>
          <CardContent className="pt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{TYPE_LABELS[type] ?? type}</h3>
            <div className="rounded-md border divide-y">
              {list.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 text-sm">
                  {a.code && <span className="font-mono text-xs text-muted-foreground w-12">{a.code}</span>}
                  <span className="flex-1">{a.name}</span>
                  {!a.isActive && <Badge variant="secondary">Inactive</Badge>}
                  {a.description && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{a.description}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
