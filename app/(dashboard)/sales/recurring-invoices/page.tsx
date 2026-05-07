import Link from "next/link";
import { format } from "date-fns";
import { Repeat, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Recurring Invoices" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  PAUSED: "outline",
  STOPPED: "destructive",
  EXPIRED: "outline",
};

export default async function RecurringInvoicesListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { profileName: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.recurringInvoice.findMany({
      where,
      orderBy: { nextOccurrenceDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.recurringInvoice.count({ where }),
  ]);

  const rows = items.map((r) => ({
    id: r.id,
    href: `/sales/recurring-invoices/${r.id}`,
    cells: [
      <span key="p" className="font-medium">{r.profileName}</span>,
      <span key="c">{r.contact.displayName}</span>,
      <span key="f">
        {r.frequency === "EVERY_N_MONTHS" ? `Every ${r.intervalN} months` : r.frequency}
      </span>,
      <span key="s">{format(r.startDate, "dd MMM yyyy")}</span>,
      <span key="n">{format(r.nextOccurrenceDate, "dd MMM yyyy")}</span>,
      <Badge key="st" variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>,
      <span key="a" className="text-right tabular-nums">
        {formatMoney(Number(r.amount), organization.currency)}
      </span>,
    ],
  }));

  const empty = (
    <div className="space-y-4">
      <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
        <Repeat className="h-10 w-10 text-primary" aria-hidden />
      </div>
      <h2 className="text-xl font-semibold">Set it once, bill on autopilot.</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Recurring profiles generate invoices automatically on the schedule you choose.
      </p>
      <Button asChild>
        <Link href="/sales/recurring-invoices/new" className="gap-1">
          <Plus className="h-4 w-4" /> Create Recurring Profile
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Recurring Invoices"
        view="All profiles"
        newHref="/sales/recurring-invoices/new"
        newLabel="New profile"
        exportHref="/api/sales/recurring-invoices/export"
        preferencesHref="/settings/preferences/invoices"
        columns={[
          { key: "profile", header: "Profile name", sortable: true },
          { key: "cust", header: "Customer name" },
          { key: "freq", header: "Frequency" },
          { key: "start", header: "Start date" },
          { key: "next", header: "Next invoice date" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        search={q}
        empty={empty}
      />
    </div>
  );
}
