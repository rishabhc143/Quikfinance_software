"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Info,
  Loader2,
  Receipt,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import {
  TransactionLineItemsTable,
  type LineItem,
  type ItemOption,
  type TaxOption,
  type AccountOption,
  type CustomerOption,
} from "@/components/shared/transaction-line-items-table";
import { AtTransactionLevelDropdown } from "@/components/shared/at-transaction-level-dropdown";
import { AttachFilesField, type AttachedFile } from "@/components/shared/attach-files-field";
import { PdfTemplatePicker } from "@/components/shared/pdf-template-picker";
import type { BillInput } from "@/lib/validations/bill";

/**
 * Bill create/edit form — Zoho-style layout (PR #270).
 *
 *   Header bar — "New Bill" + X close
 *   Vendor band (light-gray) — vendor combobox + search-icon button
 *   Meta grid (2-col) — Bill# / Order# / Bill Date / Due Date / A/P on
 *     left; Payment Terms on right (aligned with Due Date)
 *   ──── divider ────
 *   Subject (ⓘ tooltip, 250-char cap)
 *   ──── divider ────
 *   Discount Type chip ("At Line Item Level" / "At Transaction Level")
 *   Item Table — shared `TransactionLineItemsTable`
 *   Totals (current widgets, unchanged)
 *   Notes + Attach Files (2-col)
 *   Additional Fields hint
 *   Sticky footer — Save as Draft / Open / Cancel + PDF Template + Make Recurring
 *
 * Per spec carry-overs from prior versions:
 *
 *   1. Bill # is a free-text input the user types from the vendor's
 *      source doc (no auto-generation). The save action checks for
 *      duplicates per (org × vendor) and surfaces a warning toast.
 *   2. customerColumnVisible=true on the line items table so each
 *      line can optionally mark itself "billable to <customer>".
 *      Those lines surface on the customer's next Invoice via
 *      <BillableExpensesPanel>.
 *   3. No "Save and Send" button — bills are never emailed.
 */

export type BillFormProps = {
  initial?: Partial<BillInput>;
  initialLines?: LineItem[];
  vendorOptions: ComboboxOption[];
  customerOptions: CustomerOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  paymentTermsOptions: ComboboxOption[];
  /**
   * Accounts Payable account choices from the org's COA (LIABILITY
   * accounts). Usually a single "Accounts Payable" entry per the user's
   * confirmation — but we surface the full set so multi-A/P-account
   * setups work too.
   */
  accountsPayableOptions: ComboboxOption[];
  pdfTemplateOptions?: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (
    values: BillInput,
    opts?: { open?: boolean }
  ) => Promise<unknown>;
  checkDuplicateAction?: (input: {
    vendorId: string;
    number: string;
    excludeBillId?: string;
  }) => Promise<{
    duplicate: boolean;
    existing?: { id: string; number: string; issueDate: Date; status: string };
  }>;
  excludeBillId?: string;
  submitLabel?: string;
  cancelHref?: string;
  isCreate?: boolean;
  singleAction?: boolean;
};

export function BillForm({
  initial,
  initialLines,
  vendorOptions,
  customerOptions,
  itemOptions,
  taxOptions,
  accountOptions,
  paymentTermsOptions,
  accountsPayableOptions,
  pdfTemplateOptions = [],
  defaultCurrency,
  onSubmitAction,
  checkDuplicateAction,
  excludeBillId,
  submitLabel = "Save as Draft",
  cancelHref = "/purchases/bills",
  isCreate = true,
  singleAction = false,
}: BillFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "draft" | "open">("idle");

  // ───── Form state ───────────────────────────────────────────────
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null,
  );
  const [billNumber, setBillNumber] = React.useState(initial?.number ?? "");
  const [dupWarning, setDupWarning] = React.useState<{
    number: string;
    issueDate: Date;
  } | null>(null);

  async function onBillNumberBlur() {
    if (!checkDuplicateAction) return;
    if (!contactId || !billNumber.trim()) {
      setDupWarning(null);
      return;
    }
    try {
      const r = await checkDuplicateAction({
        vendorId: contactId,
        number: billNumber.trim(),
        excludeBillId,
      });
      if (r.duplicate && r.existing) {
        setDupWarning({
          number: r.existing.number,
          issueDate: new Date(r.existing.issueDate),
        });
      } else {
        setDupWarning(null);
      }
    } catch {
      // Silent — duplicate check is informational only.
    }
  }
  const [referenceNumber, setReferenceNumber] = React.useState(
    initial?.referenceNumber ?? "",
  );
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [issueDate, setIssueDate] = React.useState<Date>(
    initial?.issueDate
      ? new Date(initial.issueDate as unknown as string)
      : new Date(),
  );
  const [dueDate, setDueDate] = React.useState<Date>(
    initial?.dueDate
      ? new Date(initial.dueDate as unknown as string)
      : new Date(Date.now() + 30 * 86400000),
  );
  const [paymentTermsId, setPaymentTermsId] = React.useState<string | null>(
    initial?.paymentTermsId ?? null,
  );
  const [accountsPayableId, setAccountsPayableId] = React.useState<
    string | null
  >(
    (initial as Partial<BillInput> & { accountsPayableId?: string | null })
      ?.accountsPayableId ?? accountsPayableOptions[0]?.value ?? null,
  );
  const [placeOfSupply, setPlaceOfSupply] = React.useState<string | null>(
    initial?.placeOfSupply ?? null,
  );
  const [discountValue, setDiscountValue] = React.useState(
    String((initial?.documentDiscount?.value as number | undefined) ?? "0"),
  );
  const [discountType, setDiscountType] = React.useState<
    "percentage" | "amount"
  >(initial?.documentDiscount?.type ?? "percentage");
  const [adjustmentLabel, setAdjustmentLabel] = React.useState(
    initial?.adjustmentLabel ?? "Adjustment",
  );
  const [adjustmentValue, setAdjustmentValue] = React.useState(
    String((initial?.adjustmentValue as number | undefined) ?? "0"),
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [terms, setTerms] = React.useState(initial?.termsAndConditions ?? "");
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial?.pdfTemplateId ?? null,
  );
  const [attachments, setAttachments] = React.useState<AttachedFile[]>(
    (initial?.attachments as AttachedFile[] | undefined) ?? [],
  );
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);
  const [pdfPickerOpen, setPdfPickerOpen] = React.useState(false);

  const selectedPdfTemplateLabel = React.useMemo(() => {
    if (!pdfTemplateId) return "Standard Template";
    return (
      pdfTemplateOptions.find((o) => o.value === pdfTemplateId)?.label ??
      "Standard Template"
    );
  }, [pdfTemplateId, pdfTemplateOptions]);

  async function submit(open: boolean) {
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    if (!billNumber.trim()) {
      toast.error("Bill # is required (type it from the vendor's source doc)");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(open ? "open" : "draft");
    const payload: BillInput = {
      contactId,
      number: billNumber.trim(),
      referenceNumber: referenceNumber || null,
      subject: subject || null,
      issueDate: format(issueDate, "yyyy-MM-dd") as unknown as Date,
      dueDate: format(dueDate, "yyyy-MM-dd") as unknown as Date,
      paymentTermsId,
      placeOfSupply,
      purchaseOrderId: initial?.purchaseOrderId ?? null,
      status: singleAction
        ? (initial?.status ?? "DRAFT")
        : open
          ? "OPEN"
          : "DRAFT",
      currency: defaultCurrency,
      documentDiscount: {
        value: Number(discountValue || 0),
        type: discountType,
      },
      adjustmentLabel,
      adjustmentValue: Number(adjustmentValue || 0),
      notes,
      termsAndConditions: terms || null,
      pdfTemplateId,
      attachments,
      lines: lines
        .filter((l) => l.name.trim())
        .map((l, i) => ({
          itemId: l.itemId ?? null,
          position: i,
          name: l.name,
          description: l.description ?? null,
          hsnSacCode: l.hsnSacCode ?? null,
          accountId: l.accountId ?? null,
          billableToCustomerId: l.billableToCustomerId ?? null,
          quantity: Number(l.quantity || 0),
          rate: Number(l.rate || 0),
          taxId: l.taxId ?? null,
        })),
    };
    // Pass the A/P account id through. Cast to keep the existing
    // BillInput shape unchanged — actions.ts reads it via the same key.
    (payload as BillInput & { accountsPayableId?: string | null })
      .accountsPayableId = accountsPayableId;
    try {
      await onSubmitAction(payload, { open });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy("idle");
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="-m-6 flex flex-col min-h-[calc(100vh-4rem)]">
      {/* ───── Top bar: title + X close ───── */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold leading-tight">
            {isCreate
              ? "New Bill"
              : `Edit Bill ${initial?.number ? `#${initial.number}` : ""}`}
          </h1>
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="Close"
          className="rounded-full"
        >
          <Link href={cancelHref}>
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* ───── Vendor band — light-gray ───── */}
      <section className="bg-muted/30 border-b px-6 py-4">
        <div className="grid grid-cols-[10rem_1fr] gap-4 items-center max-w-3xl">
          <Label className="text-sm">
            <span className="text-destructive">Vendor Name *</span>
          </Label>
          <div className="flex gap-2">
            <div className="flex-1 max-w-md">
              <Combobox
                options={vendorOptions}
                value={contactId}
                onChange={setContactId}
                placeholder="Select a Vendor"
                testId="bill-vendor-combobox"
              />
            </div>
            <Button type="button" variant="default" size="icon" aria-label="Search vendor">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ───── Meta grid: Bill#, Order#, Bill Date, Due Date, A/P on left; Payment Terms on right ───── */}
      <section className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5 max-w-5xl">
        {/* Left col fields, sequential */}
        <div className="space-y-5">
          <MetaField
            label="Bill#"
            required
            htmlFor="bill-number-input"
          >
            <Input
              id="bill-number-input"
              value={billNumber}
              onChange={(e) => {
                setBillNumber(e.target.value);
                if (dupWarning) setDupWarning(null);
              }}
              onBlur={onBillNumberBlur}
              placeholder="Type the vendor's bill number"
              className="font-mono"
              required
              data-testid="bill-number-input"
            />
            {dupWarning ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                ⚠ This vendor has a bill with number{" "}
                <span className="font-mono">{dupWarning.number}</span> on{" "}
                {dupWarning.issueDate.toLocaleDateString()}. Save anyway to
                override.
              </p>
            ) : null}
          </MetaField>

          <MetaField label="Order Number">
            <Input
              value={referenceNumber ?? ""}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </MetaField>

          <MetaField label="Bill Date" required>
            <DatePicker
              value={issueDate}
              onChange={(d) => d && setIssueDate(d)}
            />
          </MetaField>

          <MetaField label="Due Date">
            <DatePicker value={dueDate} onChange={(d) => d && setDueDate(d)} />
          </MetaField>

          <MetaField
            label="Accounts Payable"
            tooltip="The default A/P account this bill posts to. Configured in Chart of Accounts."
          >
            <Combobox
              options={accountsPayableOptions}
              value={accountsPayableId}
              onChange={setAccountsPayableId}
              placeholder="Accounts Payable"
            />
          </MetaField>
        </div>

        {/* Right col: only Payment Terms, aligned with Due Date row */}
        <div className="space-y-5">
          <div className="h-10" /> {/* spacer aligns with Bill# */}
          <div className="h-10" /> {/* spacer aligns with Order Number */}
          <div className="h-10" /> {/* spacer aligns with Bill Date */}
          <MetaField label="Payment Terms">
            <Combobox
              options={paymentTermsOptions}
              value={paymentTermsId}
              onChange={setPaymentTermsId}
              placeholder="Due on Receipt"
            />
          </MetaField>
        </div>
      </section>

      <div className="border-t mx-6" />

      {/* ───── Subject ───── */}
      <section className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5 max-w-5xl">
        <MetaField
          label="Subject"
          tooltip="A short title for this bill, visible in lists and search."
        >
          <Input
            value={subject ?? ""}
            onChange={(e) => setSubject(e.target.value.slice(0, 250))}
            maxLength={250}
            placeholder="Enter a subject within 250 characters"
          />
        </MetaField>
      </section>

      <div className="border-t mx-6" />

      {/* ───── Discount Type chip ───── */}
      <section className="px-6 py-4">
        <AtTransactionLevelDropdown
          value={placeOfSupply}
          onChange={setPlaceOfSupply}
        />
      </section>

      {/* ───── Line items table ───── */}
      <section className="px-6 pb-6 space-y-4">
        <TransactionLineItemsTable
          itemOptions={itemOptions}
          taxOptions={taxOptions}
          accountOptions={accountOptions}
          customerOptions={customerOptions}
          columnConfig={{
            accountColumnVisible: "inline",
            customerColumnVisible: true,
          }}
          documentDiscount={{ value: discountValue, type: discountType }}
          adjustment={adjustmentValue}
          onChange={(ls) => setLines(ls)}
          initialLines={initialLines}
        />

        {/* ───── Totals widget (right-aligned, beneath the table) ─────
            Doc-level discount + adjustment inputs. The Sub Total / Total
            rows are computed by `TransactionLineItemsTable` above and
            shown there; here we just expose the user-editable knobs
            that feed into those totals. */}
        <div className="ml-auto max-w-md rounded-md border p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Document discount</Label>
            <div className="flex items-center gap-1">
              <MoneyInput
                value={discountValue}
                onChange={setDiscountValue}
              />
              <select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "percentage" | "amount")
                }
                className="h-10 rounded border px-2 bg-background"
                aria-label="Discount type"
              >
                <option value="percentage">%</option>
                <option value="amount">{defaultCurrency}</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Input
              value={adjustmentLabel ?? ""}
              onChange={(e) => setAdjustmentLabel(e.target.value)}
              className="max-w-[10rem] text-sm"
              aria-label="Adjustment label"
            />
            <MoneyInput
              value={adjustmentValue}
              onChange={setAdjustmentValue}
              allowNegative
            />
          </div>
        </div>
      </section>

      {/* ───── Notes + Attach Files (2-col) ───── */}
      <section className="px-6 pb-6 grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bill-notes">Notes</Label>
          <Textarea
            id="bill-notes"
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            It will not be shown in PDF
          </p>

          <Label htmlFor="bill-terms" className="pt-3 block">
            Terms &amp; conditions
          </Label>
          <Textarea
            id="bill-terms"
            value={terms ?? ""}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
          />
        </div>
        <div>
          <Label className="block mb-2">Attach File(s) to Bill</Label>
          <AttachFilesField
            initial={attachments}
            onChange={setAttachments}
            maxFiles={5}
            maxSizeMb={10}
            label=""
          />
          <p className="text-xs text-muted-foreground mt-2">
            You can upload a maximum of 5 files, 10MB each
          </p>
        </div>
      </section>

      {/* ───── Additional Fields hint ───── */}
      <section className="px-6 pb-6">
        <div className="border-t pt-4 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">
            Additional Fields:
          </strong>{" "}
          Start adding custom fields for your bills by going to{" "}
          <Link
            href="/settings"
            className="text-primary hover:underline"
          >
            Settings → Purchases → Bills
          </Link>
          .
        </div>
      </section>

      {/* ───── Sticky footer ───── */}
      <div className="mt-auto flex items-center justify-between gap-2 sticky bottom-0 bg-background border-t px-6 py-3 z-10">
        <div className="flex items-center gap-2">
          {singleAction ? (
            <Button
              type="button"
              onClick={() => submit(false)}
              disabled={busy !== "idle"}
              className="gap-1"
            >
              {busy !== "idle" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => submit(false)}
                disabled={busy !== "idle"}
                className="gap-1"
              >
                {busy === "draft" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {submitLabel}
              </Button>
              <Button
                type="button"
                onClick={() => submit(true)}
                disabled={busy !== "idle"}
                className="gap-1"
                data-testid="bill-save-as-open-button"
              >
                {busy === "open" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save as Open
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(cancelHref)}
          >
            Cancel
          </Button>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {pdfTemplateOptions.length > 0 ? (
            <>
              <span>
                PDF Template:{" "}
                <span className="font-medium text-foreground">
                  &apos;{selectedPdfTemplateLabel}&apos;
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPdfPickerOpen((s) => !s)}
                className="text-primary hover:underline"
              >
                Change
              </button>
              <span className="text-border">|</span>
            </>
          ) : null}
          <Link
            href="/purchases/recurring-bills/new"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            <RotateCw className="h-3.5 w-3.5" /> Make Recurring
          </Link>
        </div>
      </div>

      {/* PDF picker popover — toggled by the "Change" link in the footer */}
      {pdfPickerOpen && pdfTemplateOptions.length > 0 ? (
        <div className="fixed bottom-16 right-6 z-20 rounded-md border bg-card shadow-lg p-3 w-72">
          <div className="text-sm font-medium mb-2">Choose PDF template</div>
          <PdfTemplatePicker
            templates={pdfTemplateOptions}
            value={pdfTemplateId}
            onChange={(v) => {
              setPdfTemplateId(v);
              setPdfPickerOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Render a label + content row with an optional ⓘ tooltip and *
 * for required fields. Used throughout the meta grid + subject row.
 */
function MetaField({
  label,
  required,
  tooltip,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  tooltip?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 items-start">
      <Label
        htmlFor={htmlFor}
        className="text-sm pt-2 inline-flex items-center gap-1"
      >
        <span className={required ? "text-destructive" : undefined}>
          {label}
          {required ? " *" : ""}
        </span>
        {tooltip ? (
          <span title={tooltip} className="inline-flex">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        ) : null}
      </Label>
      <div>{children}</div>
    </div>
  );
}
