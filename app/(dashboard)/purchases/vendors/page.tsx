import Link from "next/link";
import { Users, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseListSearchParams } from "@/lib/list-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  bulkDeleteVendorsAction,
  bulkMarkVendorsActiveAction,
  bulkMarkVendorsInactiveAction,
} from "./actions";
import { ExportVendorsDialog } from "./export-dialog";

export const metadata = { title: "Vendors" };

type SearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
  view?: string;
};

export default async function VendorsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganization();
  const { q, page, pageSize, sort, dir } = parseListSearchParams(searchParams, {
    defaultSort: "displayName",
    defaultDir: "asc",
  });
  const savedViews = await getSavedViews(organization.id, "vendors");
  const activeView = resolveActiveView(savedViews, searchParams.view);
  const view = activeView?.slug ?? "active";

  const where = {
    organizationId: organization.id,
    type: { in: ["VENDOR", "BOTH"] as ("VENDOR" | "BOTH")[] },
    deletedAt: null,
    ...(activeView ? whereForFilter(activeView.filter) : {}),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { companyName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { workPhone: { contains: q, mode: "insensitive" as const } },
            { mobile: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "companyName"
      ? { companyName: dir }
      : sort === "createdAt"
      ? { createdAt: dir }
      : sort === "updatedAt"
      ? { updatedAt: dir }
      : { displayName: dir };

  const [vendors, total, msmePending] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        // Aggregate open Bill balance per vendor (Payables BCY).
        bills: {
          where: {
            deletedAt: null,
            status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: { total: true, amountPaid: true },
        },
        // Aggregate unused vendor-credit balance.
        vendorCredits: {
          where: { deletedAt: null, status: { in: ["OPEN"] } },
          select: { total: true, amountApplied: true, amountRefunded: true },
        },
      },
    }),
    db.contact.count({ where }),
    // MSME banner gate: India org + any active vendor with msmeRegistered
    // still null. Cheap count query, fired once per page load.
    organization.country === "IN"
      ? db.contact.count({
          where: {
            organizationId: organization.id,
            type: { in: ["VENDOR", "BOTH"] },
            deletedAt: null,
            isInactive: false,
            msmeRegistered: null,
          },
        })
      : Promise.resolve(0),
  ]);

  const rows = vendors.map((v) => {
    const payables = v.bills.reduce(
      (sum, b) => sum + (Number(b.total) - Number(b.amountPaid)),
      0
    );
    const unusedCredits = v.vendorCredits.reduce(
      (sum, c) =>
        sum +
        (Number(c.total) -
          Number(c.amountApplied) -
          Number(c.amountRefunded)),
      0
    );
    return {
      id: v.id,
      href: `/purchases/vendors/${v.id}`,
      cells: [
        <div key="name" className="flex items-center gap-2">
          <span className="font-medium">{v.displayName}</span>
          {v.isInactive ? (
            <Badge variant="outline" className="text-xs">
              Inactive
            </Badge>
          ) : null}
        </div>,
        <span key="company">{v.companyName ?? "—"}</span>,
        <span key="email">{v.email ?? "—"}</span>,
        <span key="phone">{v.workPhone ?? v.mobile ?? "—"}</span>,
        <div key="payables" className="text-right tabular-nums">
          {formatMoney(payables, organization.currency)}
        </div>,
        <div key="credits" className="text-right tabular-nums">
          {formatMoney(unusedCredits, organization.currency)}
        </div>,
      ],
    };
  });

  const empty = (
    <RichEmptyState
      icon={Users}
      title="Manage every supplier in one place"
      description="Track vendors, their bills, payments, and credits — all linked to your books."
      primaryAction={{
        label: "Create New Vendor",
        href: "/purchases/vendors/new",
      }}
      secondaryAction={{
        label: "Import File",
        href: "/purchases/vendors/import",
      }}
      importUsingHref="/purchases/vendors/import"
      benefits={[
        "Capture GSTIN, PAN, MSME registration, and bank details",
        "See open payables and unused credits at a glance",
        "Generate Purchase Orders and Bills from this vendor",
        "Optional vendor portal access",
      ]}
    />
  );

  return (
    <div className="p-6 space-y-4">
      {msmePending > 0 ? (
        <Card className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1 text-sm">
              <strong>Update MSME Details</strong> —{" "}
              {msmePending} active vendor
              {msmePending === 1 ? "" : "s"} still need{msmePending === 1 ? "s" : ""}{" "}
              MSME registration confirmed. Required under Indian compliance.
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/msme">Set up</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <TransactionListPage
        title="Vendors"
        view={viewLabel(view)}
        views={savedViews.map((v) => ({
          value: v.slug,
          label: v.label,
          id: v.id,
          isSystem: v.isSystem,
        }))}
        activeView={view}
        newHref="/purchases/vendors/new"
        newLabel="New"
        importHref="/purchases/vendors/import"
        exportDialog={
          <ExportVendorsDialog
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent rounded-sm"
              >
                Export vendors…
              </button>
            }
          />
        }
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="vendors"
            dateField="createdAt"
            amountField="openingBalance"
            statusOptions={[
              { value: "false", label: "Active" },
              { value: "true", label: "Inactive" },
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
        customFieldsHref="/settings/preferences/vendor/custom-fields"
        sortOptions={[
          { label: "Name (A→Z)", value: "displayName" },
          { label: "Company name", value: "companyName" },
          { label: "Created time", value: "createdAt" },
          { label: "Last modified time", value: "updatedAt" },
        ]}
        columns={[
          { key: "name", header: "Name", sortable: true },
          { key: "company", header: "Company name" },
          { key: "email", header: "Email" },
          { key: "phone", header: "Work phone" },
          { key: "payables", header: "Payables (BCY)", align: "right" },
          { key: "credits", header: "Unused Credits (BCY)", align: "right" },
        ]}
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
            columns={[
              { key: "name", header: "Name", sortable: true },
              { key: "company", header: "Company name" },
              { key: "email", header: "Email" },
              { key: "phone", header: "Work phone" },
              { key: "payables", header: "Payables (BCY)", align: "right" },
              { key: "credits", header: "Unused Credits (BCY)", align: "right" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
            rowNoun="vendor"
            bulkActions={[
              {
                label: "Mark Active",
                doneVerb: "Marked",
                noun: "vendor as active",
                action: bulkMarkVendorsActiveAction,
              },
              {
                label: "Mark Inactive",
                doneVerb: "Marked",
                noun: "vendor as inactive",
                action: bulkMarkVendorsInactiveAction,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "vendor",
                confirm:
                  "Delete the selected vendors? Reversible (soft delete). Vendors with open bills are blocked.",
                action: bulkDeleteVendorsAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}

function viewLabel(view: string) {
  switch (view) {
    case "active":
      return "Active vendors";
    case "inactive":
      return "Inactive vendors";
    case "portal_enabled":
      return "Vendors with portal access";
    default:
      return "All vendors";
  }
}
