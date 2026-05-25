import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ListReportTemplate } from "@/components/reports/list-report-template";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import {
  buildPaymentsReceived,
  type PaymentReceivedRow,
} from "@/lib/reports/payments-received";
import type { ListReportColumn } from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

export const metadata = { title: "Payments Received" };

/**
 * RPT-PR — Payments Received page.
 *
 * Lists every customer payment within the selected date range, sorted
 * most-recent first. Uses the shared `ListReportTemplate` — the page
 * does data fetching + column descriptors only.
 */

const COLUMN_DESCRIPTORS: CustomizeColumnDescriptor[] = [
  { key: "showDate", label: "Date", defaultEnabled: true },
  { key: "showNumber", label: "Payment #", defaultEnabled: true },
  { key: "showCustomer", label: "Customer", defaultEnabled: true },
  { key: "showMode", label: "Payment Mode", defaultEnabled: true },
  { key: "showReference", label: "Reference", defaultEnabled: true },
  { key: "showAmount", label: "Amount", defaultEnabled: true },
];

function isVisible(
  searchParams: Record<string, string | undefined> | undefined,
  paramKey: string,
  defaultVisible: boolean,
): boolean {
  const v = searchParams?.[paramKey];
  if (v === undefined) return defaultVisible;
  return v !== "0";
}

export default async function PaymentsReceivedPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const { organization, user } = await requireOrganization();

  // Parse date range using the existing preset infrastructure.
  const { range, preset } = parseRangeFromSearchParams(searchParams ?? {}, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  // Column visibility
  const cols = {
    date: isVisible(searchParams, "showDate", true),
    number: isVisible(searchParams, "showNumber", true),
    customer: isVisible(searchParams, "showCustomer", true),
    mode: isVisible(searchParams, "showMode", true),
    reference: isVisible(searchParams, "showReference", true),
    amount: isVisible(searchParams, "showAmount", true),
  };

  const [payments, activityRows, existingSchedule] = await Promise.all([
    db.paymentReceived.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        paymentDate: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        number: true,
        paymentDate: true,
        amount: true,
        paymentMode: true,
        reference: true,
        contact: { select: { id: true, displayName: true } },
      },
    }),
    getRecentReportActivity(organization.id, "payments-received", 20),
    getExistingSchedule({
      organizationId: organization.id,
      userId: user.id,
      reportKey: "payments-received",
    }),
  ]);

  const summary = buildPaymentsReceived(
    payments.map((p) => ({
      id: p.id,
      number: p.number,
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      paymentMode: p.paymentMode,
      reference: p.reference,
      contact: { id: p.contact.id, name: p.contact.displayName },
    })),
  );

  // Build columns based on visibility
  const columns: ListReportColumn<PaymentReceivedRow>[] = [];
  if (cols.date)
    columns.push({ key: "paymentDate", label: "Date", type: "date" });
  if (cols.number)
    columns.push({ key: "paymentNumber", label: "Payment #", type: "text" });
  if (cols.customer)
    columns.push({ key: "customerName", label: "Customer", type: "text" });
  if (cols.mode)
    columns.push({ key: "paymentMode", label: "Payment Mode", type: "text" });
  if (cols.reference)
    columns.push({ key: "reference", label: "Reference", type: "text" });
  if (cols.amount)
    columns.push({ key: "amount", label: "Amount", type: "money" });

  // Build export params (preserve filters).
  const exportParams = new URLSearchParams();
  exportParams.set("preset", preset);
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }
  if (!cols.date) exportParams.set("showDate", "0");
  if (!cols.number) exportParams.set("showNumber", "0");
  if (!cols.customer) exportParams.set("showCustomer", "0");
  if (!cols.mode) exportParams.set("showMode", "0");
  if (!cols.reference) exportParams.set("showReference", "0");
  if (!cols.amount) exportParams.set("showAmount", "0");

  const rangeLabel = `${format(range.start, "dd/MM/yyyy")} — ${format(range.end, "dd/MM/yyyy")}`;

  return (
    <ListReportTemplate<PaymentReceivedRow>
      reportKey="payments-received"
      title="Payments Received"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Sales</span>
          <span className="text-muted-foreground">•</span>
          <span>{rangeLabel}</span>
        </span>
      }
      filterStrip={
        <ReportFilterStrip>
          <DateRangePicker
            activePreset={preset}
            activeRange={range}
            fiscalYearStartMonth={organization.fiscalYearStart}
          />
        </ReportFilterStrip>
      }
      toolbar={{
        fiscalYearStartMonth: organization.fiscalYearStart,
        exportBaseUrl: "/reports/payments-received/export",
        exportParams: exportParams.toString(),
        customizableColumns: COLUMN_DESCRIPTORS,
        activityRows,
        existingSchedule,
      }}
      columns={columns}
      rows={summary.rows}
      totals={{ amount: summary.totalAmount }}
      emptyMessage="No payments received in the selected period."
      currency={organization.currency}
      footnote={
        <>
          **Amount is displayed in your base currency{" "}
          <span className="inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium text-[10px]">
            {organization.currency}
          </span>
        </>
      }
    />
  );
}
