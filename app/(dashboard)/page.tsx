import Link from "next/link";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { ArrowUpRight } from "lucide-react";
import { CashFlowMini, IncomeVsExpenseMini, TopExpensesPie } from "@/components/dashboard/charts";
import { NewRecordDropdown } from "./_dashboard-new-dropdown";

export default async function HomePage() {
  const { user, organization } = await requireOrganization();
  const orgId = organization.id;
  const today = new Date();

  // Monthly windows for charts (last 6 months)
  const months: { from: Date; to: Date; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(today, i);
    months.push({ from: startOfMonth(d), to: endOfMonth(d), label: format(d, "MMM") });
  }

  const [
    invoices, bills, recentTxns, expensesAgg, salesAgg, banner,
    cashFlow, incomeExpense, expensesByCategory,
  ] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { total: true, amountPaid: true, dueDate: true },
    }),
    db.bill.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { total: true, amountPaid: true, dueDate: true },
    }),
    db.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.expense.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } }),
    db.invoice.aggregate({ where: { organizationId: orgId, deletedAt: null, status: { in: ["PAID"] } }, _sum: { total: true } }),
    db.promoBanner.findFirst({ where: { organizationId: orgId, dismissedAt: null }, orderBy: { createdAt: "desc" } }),
    Promise.all(months.map(async (m) => {
      const [received, made, exp] = await Promise.all([
        db.paymentReceived.aggregate({ where: { organizationId: orgId, paymentDate: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
        db.paymentMade.aggregate({ where: { organizationId: orgId, paymentDate: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
        db.expense.aggregate({ where: { organizationId: orgId, date: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
      ]);
      const inflow = Number(received._sum.amount ?? 0);
      const outflow = Number(made._sum.amount ?? 0) + Number(exp._sum.amount ?? 0);
      return { month: m.label, inflow, outflow, net: inflow - outflow };
    })),
    Promise.all(months.map(async (m) => {
      const [income, exp] = await Promise.all([
        db.invoice.aggregate({ where: { organizationId: orgId, deletedAt: null, status: "PAID", issueDate: { gte: m.from, lte: m.to } }, _sum: { total: true } }),
        db.expense.aggregate({ where: { organizationId: orgId, date: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
      ]);
      return { month: m.label, income: Number(income._sum.total ?? 0), expense: Number(exp._sum.amount ?? 0) };
    })),
    db.expense.groupBy({
      by: ["category"], where: { organizationId: orgId },
      _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 7,
    }),
  ]);

  const expensesPie = expensesByCategory.map((g) => ({
    name: g.category,
    value: Number(g._sum.amount ?? 0),
  })).filter((g) => g.value > 0);

  const recvCurrent = invoices.filter((i) => i.dueDate >= today).reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0);
  const recvOverdue = invoices.filter((i) => i.dueDate < today).reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0);
  const payCurrent = bills.filter((b) => b.dueDate >= today).reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0);
  const payOverdue = bills.filter((b) => b.dueDate < today).reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0);

  const cur = organization.currency;
  const firstName = (user.name ?? user.email).split(" ")[0];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {firstName}</h1>
        <p className="text-sm text-muted-foreground">{organization.name}</p>
      </div>

      <nav className="flex gap-1 text-sm border-b">
        {[
          { label: "Dashboard", href: "/", active: true },
          { label: "Fiscal Year-End Tasks", href: "/fiscal-year-end" },
          { label: "Getting Started", href: "/getting-started" },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={t.active ? "px-4 py-2 border-b-2 border-primary -mb-px font-medium" : "px-4 py-2 text-muted-foreground hover:text-foreground"}
          >{t.label}</Link>
        ))}
      </nav>

      {banner && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex-1">
              <div className="font-medium text-sm">{banner.message}</div>
            </div>
            {banner.ctaUrl && banner.ctaLabel && (
              <Button asChild variant="outline" size="sm"><Link href={banner.ctaUrl}>{banner.ctaLabel}</Link></Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Total Receivables</CardTitle>
            <NewRecordDropdown
              items={[
                { label: "New Invoice", href: "/sales/invoices/new" },
                { label: "New Recurring Invoice", href: "/sales/recurring-invoices/new" },
                { label: "New Customer Payment", href: "/sales/payments-received" },
              ]}
            />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatMoney(recvCurrent + recvOverdue, cur)}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Unpaid Invoices</div>
            <div className="mt-4 space-y-2">
              <BarRow label="Current" amount={recvCurrent} max={recvCurrent + recvOverdue} currency={cur} color="bg-emerald-500" href="/sales/invoices?status=open" />
              <BarRow label="Overdue" amount={recvOverdue} max={recvCurrent + recvOverdue} currency={cur} color="bg-red-500" href="/sales/invoices?status=overdue" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Total Payables</CardTitle>
            <NewRecordDropdown
              items={[
                { label: "New Bill", href: "/purchases/bills/new" },
                { label: "New Recurring Bill", href: "/purchases/recurring-bills/new" },
                { label: "New Vendor Payment", href: "/purchases/payments-made/new" },
              ]}
            />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{formatMoney(payCurrent + payOverdue, cur)}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Unpaid Bills</div>
            <div className="mt-4 space-y-2">
              <BarRow label="Current" amount={payCurrent} max={payCurrent + payOverdue} currency={cur} color="bg-emerald-500" href="/purchases/bills?status=open" />
              <BarRow label="Overdue" amount={payOverdue} max={payCurrent + payOverdue} currency={cur} color="bg-red-500" href="/purchases/bills?status=overdue" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Sales (paid)" value={formatMoney(salesAgg._sum.total ?? 0, cur)} />
        <KpiCard title="Total Expenses" value={formatMoney(expensesAgg._sum.amount ?? 0, cur)} />
        <KpiCard title="Active Invoices" value={String(invoices.length)} />
        <KpiCard title="Active Bills" value={String(bills.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Cash flow (6m)</CardTitle></CardHeader>
          <CardContent><CashFlowMini data={cashFlow} currency={cur} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Income vs Expense (6m)</CardTitle></CardHeader>
          <CardContent><IncomeVsExpenseMini data={incomeExpense} currency={cur} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top expense categories</CardTitle></CardHeader>
          <CardContent><TopExpensesPie data={expensesPie} currency={cur} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {recentTxns.length === 0 ? (
            <EmptyState text="No activity yet — start by creating your first invoice or item." />
          ) : (
            <ul className="divide-y">
              {recentTxns.map((t) => (
                <li key={t.id} className="py-2 text-sm flex items-center justify-between">
                  <span><strong>{t.action}</strong> {t.entityType}</span>
                  <span className="text-xs text-muted-foreground">{t.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BarRow({ label, amount, max, currency, color, href }: { label: string; amount: number; max: number; currency: string; color: string; href: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (amount / max) * 100)) : 0;
  return (
    <Link href={href} className="block group">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground group-hover:text-foreground">{label}</span>
        <span className="font-medium">{formatMoney(amount, currency)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
    <ArrowUpRight className="h-5 w-5 opacity-30" />
    {text}
  </div>;
}
