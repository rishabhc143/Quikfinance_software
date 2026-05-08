import Link from "next/link";
import { Plus, Download, Check, UserCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
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
    <div className="flex flex-col items-center max-w-2xl mx-auto py-8">
      {/* Avatar with + badge */}
      <div className="relative mb-6">
        <UserCircle2
          className="h-24 w-24 text-muted-foreground/60"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="absolute -bottom-1 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-2 ring-background">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </div>
      </div>

      {/* Heading + subheading */}
      <h2 className="text-xl font-semibold mb-2 text-center">
        Every sale starts with a customer
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        Create and manage your customers and their contact persons, all in
        one place.
      </p>

      {/* Primary CTAs */}
      <div className="flex items-center gap-3 mb-6">
        <Button asChild className="gap-1">
          <Link href="/sales/customers/new">
            <Plus className="h-4 w-4" /> Create New Customer
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-1">
          <Link href="/sales/customers/import">
            <Download className="h-4 w-4" /> Import File
          </Link>
        </Button>
      </div>

      {/* "- or -" separator + social import icons */}
      <div className="text-xs text-muted-foreground mb-3">- or -</div>
      <div className="flex items-center gap-3 mb-10">
        <span className="text-xs text-muted-foreground">Import using</span>
        <Link
          href="/sales/customers/import"
          aria-label="Import via cloud storage"
          className="rounded-full p-1 hover:bg-accent transition-colors"
        >
          {/* Cloud / link icon (decorative tint) */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </Link>
        <Link
          href="/sales/customers/import"
          aria-label="Import from Google Contacts"
          className="rounded-full p-1 hover:bg-accent transition-colors"
        >
          {/* Google G mark */}
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
            />
          </svg>
        </Link>
        <Link
          href="/sales/customers/import"
          aria-label="Import from Microsoft Contacts"
          className="rounded-full p-1 hover:bg-accent transition-colors"
        >
          {/* Microsoft 4-square mark */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
            <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
          </svg>
        </Link>
      </div>

      {/* Key Benefits card */}
      <div className="w-full rounded-lg border bg-card px-6 py-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block h-4 w-4 rounded-sm bg-amber-100 dark:bg-amber-950" aria-hidden />
          <span className="text-sm font-semibold">Key Benefits</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8">
          {[
            "Stay connected with multiple contact persons",
            "Provide portal access to customers",
            "Handle multiple addresses effortlessly",
            "Create multi-currency transactions for contacts",
          ].map((benefit) => (
            <div key={benefit} className="flex items-start gap-2 text-sm">
              <Check
                className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0"
                strokeWidth={3}
                aria-hidden
              />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Customers"
        view={viewLabel(view)}
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/sales/customers/new"
        newLabel="New"
        importHref="/sales/customers/import"
        exportHref="/api/sales/customers/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Customers"
            exportHref="/api/sales/customers/export"
            showDateRange={false}
            statusOptions={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "portal_enabled", label: "Portal-enabled" },
            ]}
            trigger={
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm"
              >
                Export…
              </button>
            }
          />
        }
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
