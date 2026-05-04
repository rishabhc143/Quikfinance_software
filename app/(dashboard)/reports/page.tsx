import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileBarChart, ArrowRight, Wallet, Receipt } from "lucide-react";

export const metadata = { title: "Reports" };

const REPORTS = [
  { href: "/reports/profit-loss", label: "Profit & Loss", icon: TrendingUp, complete: true, hint: "Revenue minus expenses across a period." },
  { href: "/reports/ar-aging", label: "Receivables Aging", icon: Wallet, complete: true, hint: "Outstanding customer invoices bucketed by days overdue." },
  { href: "/reports/ap-aging", label: "Payables Aging", icon: Receipt, complete: true, hint: "Outstanding vendor bills bucketed by days overdue." },
  { href: "/reports/balance-sheet", label: "Balance Sheet", icon: FileBarChart, complete: true, hint: "Assets, liabilities, and equity (cash-basis approximation)." },
  { href: "/reports/cash-flow", label: "Cash Flow", icon: TrendingUp, complete: true, hint: "Inflow vs outflow across recent months with chart." },
  { href: "/reports/sales-summary", label: "Sales Summary", icon: Receipt, complete: true, hint: "Top customers and items by revenue." },
  { href: "/reports/tax-summary", label: "Tax Summary", icon: FileBarChart, complete: true, hint: "Tax collected, paid, and net owed." },
];

export default function ReportsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Financial reports compiled live from your accounting data.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href}>
              <Card className="hover:bg-muted/30 transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {r.label}
                    {!r.complete && <Badge variant="outline" className="ml-auto text-[10px]">Soon</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span>{r.hint}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
