import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseListSearchParams } from "@/lib/list-params";
import { StatusPill } from "@/components/ui/status-pill";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import { RichEmptyState } from "@/components/shared/rich-empty-state";
import { formatMoney } from "@/lib/money";
import {
  getSavedViews,
  resolveActiveView,
  whereForFilter,
} from "@/lib/sales/saved-views";
import { bulkDeletePaymentsMadeAction } from "./actions";

export const metadata = { title: "Payments Made" };

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function PaymentsMadeListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const { q, page, pageSize, sort, dir } = parseListSearchParams(searchParams, {
    defaultSort: "paymentDate",
  });

  const savedViews = await getSavedViews(organization.id, "payments_made");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" as const } },
            { reference: { contains: q, mode: "insensitive" as const } },
            {
              contact: {
                displayName: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "number"
      ? { number: dir }
      : sort === "amount"
      ? { amount: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : { paymentDate: dir };

  const vendors = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: { in: ["VENDOR", "BOTH"] },
      deletedAt: null,
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  const [payments, total] = await Promise.all([
    db.paymentMade.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        contact: { select: { displayName: true } },
        allocations: {
          select: { id: true, bill: { select: { number: true } } },
        },
      },
    }),
    db.paymentMade.count({ where }),
  ]);

  const rows = payments.map((p) => {
    const allocLabel =
      p.paymentType === "VENDOR_ADVANCE"
        ? "Advance"
        : p.allocations.length === 0
        ? "—"
        : p.allocations.length === 1
        ? p.allocations[0].bill.number
        : `${p.allocations.length} bills`;
    return {
      id: p.id,
      href: `/purchases/payments-made/${p.id}`,
      cells: [
        <span key="d">{format(p.paymentDate, "dd MMM yyyy")}</span>,
        <span key="n" className="font-mono">{p.number}</span>,
        <span key="v">{p.contact.displayName}</span>,
        <StatusPill
          key="t"
          variant={p.paymentType === "VENDOR_ADVANCE" ? "info" : "neutral"}
        >
          {p.paymentType === "VENDOR_ADVANCE" ? "Advance" : "Bill payment"}
        </StatusPill>,
        <span key="m">{p.paymentMode ?? p.method ?? "—"}</span>,
        <span key="a" className="text-right tabular-nums">
          {formatMoney(Number(p.amount), organization.currency)}
        </span>,
        <span key="al" className="text-xs">{allocLabel}</span>,
      ],
    };
  });

  const empty = (
    <RichEmptyState
      icon={Wallet}
      title="Record money paid to vendors"
      description="Allocate payments against open bills, or record vendor advances that you'll draw against later."
      primaryAction={{
        label: "Record payment",
        href: "/purchases/payments-made/new",
      }}
      benefits={[
        "Pay multiple bills in one transaction",
        "Record vendor advances and draw against them on future bills",
        "Reconcile against your bank statements",
        "TDS-aware payments for India compliance",
      ]}
    />
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Payments Made"
        view="All payments"
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/payments-made/new"
        newLabel="Record"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="payments_made"
            dateField="paymentDate"
            amountField="amount"
            customerOptions={vendors.map((v) => ({
              id: v.id,
              label: v.displayName,
            }))}
            statusOptions={[
              { value: "BILL_PAYMENT", label: "Bill payment" },
              { value: "VENDOR_ADVANCE", label: "Vendor advance" },
            ]}
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-primary hover:bg-accent rounded-sm"
              >
                + New Custom View
              </button>
            }
          />
        }
        preferencesHref="/settings/preferences/customers-and-vendors"
        customFieldsHref="/settings/preferences/payment_made/custom-fields"
        sortOptions={[
          { label: "Payment date", value: "paymentDate" },
          { label: "Payment #", value: "number" },
          { label: "Amount", value: "amount" },
          { label: "Created time", value: "createdAt" },
        ]}
        columns={PM_COLUMNS}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        search={q}
        empty={empty}
        customTable={
          <BulkAwareDataTable
            columns={PM_COLUMNS}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="payment"
            bulkActions={[
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "payment",
                confirm:
                  "Delete the selected payments? Bill balances will be restored — any bills marked Paid will revert to Open / Partially Paid.",
                action: bulkDeletePaymentsMadeAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

const PM_COLUMNS = [
  { key: "date", header: "Date", sortable: true },
  { key: "number", header: "Payment #", sortable: true },
  { key: "vendor", header: "Vendor name" },
  { key: "type", header: "Type" },
  { key: "mode", header: "Mode" },
  { key: "amount", header: "Amount", align: "right" as const, sortable: true },
  { key: "applied", header: "Applied to" },
];
