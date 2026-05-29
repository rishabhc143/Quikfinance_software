import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { BankingEmptyState } from "@/components/banking/empty-state";

export const metadata = { title: "Banking" };

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  BANK: "Bank",
  CREDIT_CARD: "Credit Card",
  PAYPAL: "PayPal",
};

export default async function BankingPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });

  // When zero accounts exist, render the dedicated empty-state.
  if (accounts.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BankingEmptyState />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-sm text-muted-foreground">
            Manage bank accounts, import statements, and reconcile.
          </p>
        </div>
        <Button asChild>
          <Link href="/banking/accounts/new">
            <Plus className="h-4 w-4 mr-1" /> Add Bank Account
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <Link
                  href={`/banking/accounts/${a.id}`}
                  className="truncate hover:underline"
                >
                  {a.name}
                </Link>
                <div className="flex items-center gap-1">
                  {a.isPrimary ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Primary
                    </Badge>
                  ) : null}
                  <Badge variant="outline">
                    {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">Opening balance</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatMoney(Number(a.openingBalance), a.currency)}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {a._count.transactions} transactions
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs">
                <Link
                  href={`/banking/accounts/${a.id}`}
                  className="text-primary hover:underline"
                >
                  Open
                </Link>
                <Link
                  href={`/banking/accounts/${a.id}/import`}
                  className="text-primary hover:underline"
                >
                  Import Statement
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
