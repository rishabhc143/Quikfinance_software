import Link from "next/link";
import { format } from "date-fns";
import { Truck, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import {
  bulkDeleteDeliveryChallansAction,
  bulkMarkChallansOpenAction,
} from "./actions";

export const metadata = { title: "Delivery Challans" };

export default async function DeliveryChallansListPage({
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
            { number: { contains: q, mode: "insensitive" as const } },
            { contact: { displayName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.deliveryChallan.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { contact: { select: { displayName: true } } },
    }),
    db.deliveryChallan.count({ where }),
  ]);

  const rows = items.map((c) => ({
    id: c.id,
    href: `/sales/delivery-challans/${c.id}`,
    cells: [
      <span key="d">{format(c.date, "dd MMM yyyy")}</span>,
      <span key="n" className="font-mono">{c.number}</span>,
      <span key="c">{c.contact?.displayName ?? "—"}</span>,
      <span key="ref">{c.referenceNumber ?? "—"}</span>,
      <span key="t">{c.challanType}</span>,
      <Badge key="s" variant="outline">{c.status}</Badge>,
    ],
  }));

  const empty = (
    <div className="space-y-4">
      <Truck className="h-12 w-12 mx-auto text-primary" aria-hidden />
      <h2 className="text-xl font-semibold">Track every shipment.</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Use delivery challans to track goods shipped to customers before the
        invoice settles.
      </p>
      <Button asChild>
        <Link href="/sales/delivery-challans/new" className="gap-1">
          <Plus className="h-4 w-4" /> Create Delivery Challan
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="p-6">
      <TransactionListPage
        title="Delivery Challans"
        view="All challans"
        newHref="/sales/delivery-challans/new"
        newLabel="New"
        savedViewBuilder={
          <SavedViewBuilderDialog
            module="delivery_challans"
            statusOptions={[
              { value: "DRAFT", label: "Draft" },
              { value: "OPEN", label: "Open" },
              { value: "DELIVERED", label: "Delivered" },
              { value: "INVOICED", label: "Invoiced" },
              { value: "RETURNED", label: "Returned" },
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
        exportHref="/api/sales/delivery-challans/export"
        exportDialog={
          <SalesExportDialog
            entityLabel="Delivery Challans"
            exportHref="/api/sales/delivery-challans/export"
            statusOptions={[
              { value: "all", label: "All" },
              { value: "DRAFT", label: "Draft" },
              { value: "OPEN", label: "Open" },
              { value: "DELIVERED", label: "Delivered" },
              { value: "INVOICED", label: "Invoiced" },
              { value: "RETURNED", label: "Returned" },
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
        customFieldsHref="/settings/preferences/delivery-challans/custom-fields"
        columns={[
          { key: "date", header: "Date", sortable: true },
          { key: "number", header: "Challan #", sortable: true },
          { key: "cust", header: "Customer name" },
          { key: "ref", header: "Reference #" },
          { key: "type", header: "Challan type" },
          { key: "status", header: "Status" },
        ]}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        search={q}
        empty={empty}
        customTable={
          <BulkAwareDataTable
            columns={[
              { key: "date", header: "Date", sortable: true },
              { key: "number", header: "Challan #", sortable: true },
              { key: "cust", header: "Customer name" },
              { key: "ref", header: "Reference #" },
              { key: "type", header: "Challan type" },
              { key: "status", header: "Status" },
            ]}
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            search={q}
            rowNoun="challan"
            bulkActions={[
              {
                label: "Mark as Open",
                doneVerb: "Marked",
                noun: "challan as open",
                action: async (ids) => bulkMarkChallansOpenAction({ ids }),
              },
              {
                label: "Print",
                href: (ids) =>
                  `/sales/delivery-challans/bulk-pdf?ids=${ids.join(",")}`,
              },
              {
                label: "Export Selected",
                href: (ids) =>
                  `/api/sales/delivery-challans/export?mode=selected&ids=${ids.join(",")}`,
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "challan",
                confirm: "Delete the selected challans? Invoiced challans cannot be deleted.",
                action: async (ids) => bulkDeleteDeliveryChallansAction({ ids }),
              },
            ]}
          />
        }
      />
    </div>
  );
}
