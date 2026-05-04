import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Opening Balances" };

export default async function OpeningBalancesPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, openingBalance: true, currency: true },
    orderBy: { name: "asc" },
  });
  return (
    <SettingsShell title="Opening Balances" description="Bring forward balances from your previous accounting system.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Opening balances live on each bank account. Edit them by opening the account from /banking.</AlertDescription></Alert>
      <Card>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No bank accounts yet. <Link href="/banking/accounts/new" className="underline">Create one</Link>.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Account</th><th className="text-right p-3">Opening balance</th></tr></thead>
              <tbody className="divide-y">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(Number(a.openingBalance), a.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Button asChild variant="outline"><Link href="/banking">Manage bank accounts</Link></Button>
    </SettingsShell>
  );
}
