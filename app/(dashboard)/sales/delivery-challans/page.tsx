import { format } from "date-fns";
import { PackageCheck } from "lucide-react";
import { SalesEmptyState } from "@/components/shared/sales-empty-state";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { TransactionListPage } from "@/components/shared/transaction-list-page";
import { BulkAwareDataTable } from "@/components/shared/bulk-aware-data-table";
import { SalesExportDialog } from "@/components/shared/sales-export-dialog";
import { SavedViewBuilderDialog } from "@/components/shared/saved-view-builder-dialog";
import {
  bulkDeleteDeliveryChallansAction,
  bulkMarkChallansOpenAction,
} from "./actions";
import { withDiagnostic } from "@/app/(dashboard)/sales/_diagnostic";

export const metadata = { title: "Delivery Challans" };

async function DeliveryChallansListPage({
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
    <SalesEmptyState
      icon={PackageCheck}
      title="Track every shipment"
      description="Issue delivery challans for goods sent to customers before the invoice settles."
      primaryAction={{ label: "Create Delivery Challan", href: "/sales/delivery-challans/new" }}
      benefits={[
        "Convert into an invoice when the goods are billable",
        "Track delivery dates and customer signatures",
        "Print or email PDF challans",
        "Bulk download as a zip",
      ]}
    />
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
                action: bulkMarkChallansOpenAction,
              },
              {
                label: "Print",
                hrefBase: "/sales/delivery-challans/bulk-pdf",
              },
              {
                label: "Export Selected",
                hrefBase: "/api/sales/delivery-challans/export", hrefQuery: { mode: "selected" },
              },
              {
                label: "Delete",
                variant: "destructive",
                doneVerb: "Deleted",
                noun: "challan",
                confirm: "Delete the selected challans? Invoiced challans cannot be deleted.",
                action: bulkDeleteDeliveryChallansAction,
              },
            ]}
          />
        }
      />
    </div>
  );
}


export default withDiagnostic("/sales/delivery-challans", DeliveryChallansListPage);
