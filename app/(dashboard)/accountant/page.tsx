import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Book,
  FileText,
  ArrowRight,
  Layers,
  Globe,
  Target,
} from "lucide-react";

export const metadata = { title: "Accountant" };

const TILES = [
  { href: "/accountant/chart-of-accounts", label: "Chart of Accounts", icon: Book, complete: true },
  { href: "/accountant/manual-journals", label: "Manual Journals", icon: FileText, complete: true },
  { href: "/accountant/currency-adjustments", label: "Currency Adjustments", icon: Globe, complete: true },
  { href: "/accountant/budgets", label: "Budgets", icon: Target, complete: true },
  { href: "/accountant/bulk-update", label: "Bulk Update", icon: Layers, complete: true },
];

export default async function AccountantPage() {
  const { organization } = await requireOrganization();
  const [accountCount, journalCount] = await Promise.all([
    db.chartOfAccount.count({ where: { organizationId: organization.id, isActive: true } }),
    db.manualJournal.count({ where: { organizationId: organization.id } }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accountant</h1>
        <p className="text-sm text-muted-foreground">
          Chart of accounts, manual journals, currency adjustments, and budgets.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Active accounts</div><div className="text-2xl font-semibold mt-1">{accountCount}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Manual journals</div><div className="text-2xl font-semibold mt-1">{journalCount}</div></CardContent></Card>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
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
                <CardContent className="text-xs text-muted-foreground flex items-center justify-between">Open <ArrowRight className="h-3 w-3" /></CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
