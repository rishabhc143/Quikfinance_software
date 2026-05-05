import Link from "next/link";
import { format } from "date-fns";
import { FileText, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Quotes" };

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  ACCEPTED: "secondary",
  DECLINED: "destructive",
  EXPIRED: "destructive",
  INVOICED: "secondary",
};

export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; pageSize?: string; sort?: string; dir?: string };
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? 25);
  const sort = searchParams.sort ?? "issueDate";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { referenceNumber: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "number"
      ? { number: dir }
      : sort === "total"
      ? { total: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { issueDate: dir };

  const [quotes, total] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.quote.count({ where }),
  ]);

  const rows = quotes.map((qq) => ({
    id: qq.id,
    href: `/sales/quotes/${qq.id}`,
    cells: [
      <span key="date">{format(qq.issueDate, "dd MMM yyyy")}</span>,
      <span key="num" className="font-mono">
        {qq.number}
      </span>,
      <span key="ref">{qq.referenceNumber ?? "—"}</span>,
      <span key="cust">{qq.contact.displayName}</span>,
      <Badge key="st" variant={STATUS_VARIANT[qq.status] ?? "outline"}>
        {qq.status}
      </Badge>,
      <span key="amt" className="text-right tabular-nums">
        {formatMoney(Number(qq.total), qq.currency)}
      </span>,
      <span key="exp">{qq.expiryDate ? format(qq.expiryDate, "dd MMM yyyy") : "—"}</span>,
    ],
  }));

  const empty = (
    <div className="space-y-6">
      <div className="rounded-lg border bg-background p-8 max-w-lg mx-auto space-y-4">
        <div className="mx-auto h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="h-10 w-10 text-primary" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Seal the deal.</h2>
          <p className="text-sm text-muted-foreground mt-1">
            With quotes, give your customers an offer they can&apos;t refuse!
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button asChild>
            <Link href="/sales/quotes/new" className="gap-1">
              <Plus className="h-4 w-4" /> Create New Quote
            </Link>
          </Button>
          <Link
            href="/sales/quotes/import"
            className="text-sm text-primary hover:underline"
          >
            Import Quotes
          </Link>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 text-center">
          Life cycle of a Quote
        </div>
        <svg
          viewBox="0 0 720 100"
          className="mx-auto w-full max-w-3xl"
          role="img"
          aria-label="Quote lifecycle diagram"
        >
          {[
            { x: 20, label: "Quote" },
            { x: 180, label: "Sent" },
            { x: 360, label: "Accepted" },
            { x: 540, label: "Invoice" },
          ].map((b, i, all) => (
            <g key={b.label}>
              <rect
                x={b.x}
                y={30}
                width={120}
                height={40}
                rx={6}
                fill="hsl(var(--muted))"
                stroke="hsl(var(--border))"
              />
              <text
                x={b.x + 60}
                y={55}
                textAnchor="middle"
                className="fill-foreground"
                fontSize={14}
              >
                {b.label}
              </text>
              {i < all.length - 1 ? (
                <line
                  x1={b.x + 120}
                  y1={50}
                  x2={all[i + 1].x}
                  y2={50}
                  stroke="hsl(var(--border))"
                />
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <div className="border-t pt-4 max-w-lg mx-auto text-left">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          In the Quotes module, you can:
        </div>
        <ul className="space-y-1 text-sm">
          <li>• Customize your quote with your branding</li>
          <li>• Convert an accepted quote into an invoice or sales order</li>
          <li>• Know when a quote has been viewed, accepted, or declined</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="All Quotes"
        view="All quotes"
        newHref="/sales/quotes/new"
        newLabel="New"
        importHref="/sales/quotes/import"
        preferencesHref="/settings/preferences/quotes"
        sortOptions={[
          { label: "Date", value: "issueDate" },
          { label: "Quote number", value: "number" },
          { label: "Amount", value: "total" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Quote #", sortable: true },
          { key: "ref", header: "Reference #" },
          { key: "cust", header: "Customer name" },
          { key: "status", header: "Status" },
          { key: "amount", header: "Amount", align: "right", sortable: true },
          { key: "expiry", header: "Expiry date" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        search={q}
        empty={empty}
      />
    </div>
  );
}
