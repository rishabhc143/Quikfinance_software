import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowRightLeft, CreditCard, TrendingDown, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Banking" };

const TILES = [
  { href: "/banking/accounts", label: "Bank Accounts", icon: Wallet, complete: true },
  { href: "/banking/transactions", label: "Transactions", icon: ArrowRightLeft, complete: true },
  { href: "/banking/transfers", label: "Bank Transfers", icon: ArrowRightLeft, complete: true },
  { href: "/banking/card-payments", label: "Card Payments", icon: CreditCard, complete: true },
  { href: "/banking/owner-drawings", label: "Owner Drawings", icon: TrendingDown, complete: true },
  { href: "/banking/other-income", label: "Other Income", icon: TrendingUp, complete: true },
];

export default async function BankingPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-sm text-muted-foreground">Bank accounts, transactions, transfers, and reconciliation.</p>
        </div>
        <Button asChild><Link href="/banking/accounts/new"><Plus className="h-4 w-4 mr-1" /> Add Bank Account</Link></Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <p>No bank accounts yet.</p>
            <Button asChild><Link href="/banking/accounts/new">+ Add your first bank account</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="truncate">{a.name}</span>
                  <Badge variant="outline">{a.accountType}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground">Opening balance</div>
                <div className="text-2xl font-semibold tabular-nums">{formatMoney(Number(a.openingBalance), a.currency)}</div>
                <div className="mt-2 text-xs text-muted-foreground">{a._count.transactions} transactions</div>
                <Link href={`/banking/transactions?account=${a.id}`} className="text-xs text-primary hover:underline mt-2 inline-block">View transactions</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
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
