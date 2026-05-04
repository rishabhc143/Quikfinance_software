import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileText, Receipt, RefreshCw, ShoppingBag, FileCheck, Repeat, CreditCard, Wallet } from "lucide-react";

export const metadata = { title: "Sales" };

const TILES = [
  { href: "/sales/invoices", label: "Invoices", icon: FileText, complete: true },
  { href: "/sales/quotes", label: "Quotes", icon: FileCheck, complete: true },
  { href: "/sales/orders", label: "Sales Orders", icon: ShoppingBag, complete: true },
  { href: "/sales/credit-notes", label: "Credit Notes", icon: Receipt, complete: true },
  { href: "/sales/recurring-invoices", label: "Recurring Invoices", icon: Repeat, complete: true },
  { href: "/sales/retail-invoices", label: "Retail Invoices", icon: CreditCard, complete: true },
  { href: "/sales/delivery-challans", label: "Delivery Challans", icon: RefreshCw, complete: true },
  { href: "/sales/payments-received", label: "Payments Received", icon: Wallet, complete: true },
];

export default async function SalesPage() {
  const { organization } = await requireOrganization();
  const [invoiceCount, quoteCount, openInvoices] = await Promise.all([
    db.invoice.count({ where: { organizationId: organization.id, deletedAt: null } }),
    db.quote.count({ where: { organizationId: organization.id } }),
    db.invoice.count({ where: { organizationId: organization.id, deletedAt: null, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } } }),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-sm text-muted-foreground">Quotes, invoices, sales orders, credit notes, and customer payments.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Invoices" value={invoiceCount} />
        <Stat label="Open invoices" value={openInvoices} />
        <Stat label="Quotes" value={quoteCount} />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
