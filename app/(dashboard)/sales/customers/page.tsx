import Link from "next/link";
import { UserPlus, Users, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { CustomersTable } from "./customers-table";
import { bulkSetCustomerActiveAction } from "./actions";
import { formatMoney } from "@/lib/money";
import {
  getSavedViews,
  resolveActiveView,
  whereForFilter,
} from "@/lib/sales/saved-views";

export const metadata = { title: "Customers" };

const PAGE_SIZE_DEFAULT = 25;

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function CustomersListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const q = searchParams.q?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const pageSize = Number(searchParams.pageSize ?? PAGE_SIZE_DEFAULT);
  const sort = searchParams.sort ?? "displayName";
  const dir = searchParams.dir === "desc" ? "desc" : "asc";
  // M17d: Saved Views chevron-dropdown is DB-backed.
  const savedViews = await getSavedViews(organization.id, "customers");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "all";

  const where = {
    organizationId: organization.id,
    type: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] },
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { companyName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { workPhone: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy = sortOrderBy(sort, dir);

  const [customers, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        invoices: {
          where: {
            deletedAt: null,
            status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: { total: true, amountPaid: true, status: true },
        },
      },
    }),
    db.contact.count({ where }),
  ]);

  const rows = customers.map((c) => {
    const open = c.invoices;
    const balance = open.reduce(
      (sum, i) => sum + (Number(i.total) - Number(i.amountPaid)),
      0
    );
    const unpaidCount = open.length;
    return {
      id: c.id,
      href: `/sales/customers/${c.id}`,
      cells: [
        <div key="name" className="flex items-center gap-2">
          <span className="font-medium">{c.displayName}</span>
          {c.isInactive ? (
            <Badge variant="outline" className="text-xs">
              Inactive
            </Badge>
          ) : null}
        </div>,
        <span key="company">{c.companyName ?? "—"}</span>,
        <span key="email">{c.email ?? "—"}</span>,
        <span key="phone">{c.workPhone ?? c.phone ?? "—"}</span>,
        <div key="recv" className="text-right tabular-nums">
          {formatMoney(balance, organization.currency)}
        </div>,
        <div key="unpaid" className="text-right">
          {unpaidCount > 0 ? (
            <Badge variant="secondary">{unpaidCount}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>,
      ],
    };
  });

  const empty = (
    <div className="space-y-6">
      <div className="mx-auto h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center">
        <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Every sale starts with a customer</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Create and manage your customers and their contact persons, all in one place.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button asChild className="gap-1">
          <Link href="/sales/customers/new">
            <UserPlus className="h-4 w-4" /> Create New Customer
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1">
          <Link href="/sales/customers/import">
            <FileSpreadsheet className="h-4 w-4" /> Import File
          </Link>
        </Button>
      </div>
      <div className="border-t pt-4 mt-4 mx-auto max-w-lg text-left">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Key benefits
        </div>
        <ul className="space-y-1 text-sm">
          <li>• Stay connected with multiple contact persons</li>
          <li>• Provide portal access to customers</li>
          <li>• Handle multiple addresses effortlessly</li>
          <li>• Create multi-currency transactions for contacts</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Customers"
        view={viewLabel(view)}
        views={savedViews.map((v) => ({ value: v.slug, label: v.label }))}
        activeView={view}
        newHref="/sales/customers/new"
        newLabel="New"
        importHref="/sales/customers/import"
        exportHref="/api/sales/customers/export"
        preferencesHref="/settings/preferences/customers-and-vendors"
        sortOptions={[
          { label: "Name (A→Z)", value: "displayName" },
          { label: "Company name", value: "companyName" },
          { label: "Receivables (BCY)", value: "receivables" },
          { label: "Created time", value: "createdAt" },
          { label: "Last modified time", value: "updatedAt" },
        ]}
        columns={[
          { key: "name", header: "Name", sortable: true },
          { key: "company", header: "Company name" },
          { key: "email", header: "Email" },
          { key: "phone", header: "Work phone" },
          { key: "receivables", header: "Receivables (BCY)", align: "right" },
          { key: "unpaid", header: "Unpaid", align: "right" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir as "asc" | "desc"}
        search={q}
        empty={empty}
        customTable={
          <CustomersTable
            rows={rows}
            columns={[
              { key: "name", header: "Name", sortable: true },
              { key: "company", header: "Company name" },
              { key: "email", header: "Email" },
              { key: "phone", header: "Work phone" },
              { key: "receivables", header: "Receivables (BCY)", align: "right" },
              { key: "unpaid", header: "Unpaid", align: "right" },
            ]}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir as "asc" | "desc"}
            search={q}
            bulkSetActive={bulkSetCustomerActiveAction}
          />
        }
      />
    </div>
  );
}

function sortOrderBy(sort: string, dir: "asc" | "desc") {
  switch (sort) {
    case "companyName":
      return { companyName: dir };
    case "createdAt":
      return { createdAt: dir };
    case "updatedAt":
      return { updatedAt: dir };
    case "receivables":
      // Receivables can't be sorted at the SQL level without a join+sum;
      // fall back to displayName for now (sortable in-memory in S8).
      return { displayName: dir };
    default:
      return { displayName: dir };
  }
}

function viewLabel(view: string) {
  switch (view) {
    case "active":
      return "Active customers";
    case "inactive":
      return "Inactive customers";
    case "portal_enabled":
      return "Customers with portal access";
    default:
      return "All customers";
  }
}
