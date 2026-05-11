"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
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
 * Bill create/edit form.
 *
 * Mirrors po-form.tsx with three vendor-bill-specific changes:
 *
 *   1. Bill # is a free-text input the user types from the vendor's
 *      source doc (no auto-generation). The save action checks for
 *      duplicates per (org × vendor) and surfaces a warning toast
 *      — but lets the save proceed.
 *   2. customerColumnVisible=true on the line items table so each
 *      line can optionally mark itself "billable to <customer>".
 *      Those lines surface on the customer's next Invoice via
 *      <BillableExpensesBanner>.
 *   3. No "Save and Send" button — bills are never emailed per the
 *      master prompt. Buttons are Save as Draft / Save as Open /
 *      Cancel. The Notes field carries the marker that it is
 *      internal-use only.
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
  pdfTemplateOptions?: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (
    values: BillInput,
    opts?: { open?: boolean }
  ) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
  isCreate?: boolean;
  /** From the bill detail page: show "Update bill" instead of dual-button
   *  Save-Draft / Save-Open behavior. */
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
  pdfTemplateOptions = [],
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save as Draft",
  cancelHref = "/purchases/bills",
  isCreate = true,
  singleAction = false,
}: BillFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "draft" | "open">("idle");

  // Form state.
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null
  );
  const [billNumber, setBillNumber] = React.useState(initial?.number ?? "");
  const [referenceNumber, setReferenceNumber] = React.useState(
    initial?.referenceNumber ?? ""
  );
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [issueDate, setIssueDate] = React.useState<Date>(
    initial?.issueDate ? new Date(initial.issueDate as unknown as string) : new Date()
  );
  const [dueDate, setDueDate] = React.useState<Date>(
    initial?.dueDate
      ? new Date(initial.dueDate as unknown as string)
      : new Date(Date.now() + 30 * 86400000)
  );
  const [paymentTermsId, setPaymentTermsId] = React.useState<string | null>(
    initial?.paymentTermsId ?? null
  );
  const [placeOfSupply, setPlaceOfSupply] = React.useState<string | null>(
    initial?.placeOfSupply ?? null
  );
  const [discountValue, setDiscountValue] = React.useState(
    String((initial?.documentDiscount?.value as number | undefined) ?? "0")
  );
  const [discountType, setDiscountType] = React.useState<
    "percentage" | "amount"
  >(initial?.documentDiscount?.type ?? "percentage");
  const [adjustmentLabel, setAdjustmentLabel] = React.useState(
    initial?.adjustmentLabel ?? "Adjustment"
  );
  const [adjustmentValue, setAdjustmentValue] = React.useState(
    String((initial?.adjustmentValue as number | undefined) ?? "0")
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [terms, setTerms] = React.useState(initial?.termsAndConditions ?? "");
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial?.pdfTemplateId ?? null
  );
  const [attachments, setAttachments] = React.useState<AttachedFile[]>(
    (initial?.attachments as AttachedFile[] | undefined) ?? []
  );
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);

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
    try {
      await onSubmitAction(payload, { open });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      // Next.js redirect() throws a sentinel we ignore.
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy("idle");
    }
  }

  return (
    <div className="space-y-6">
      {/* ───── Vendor band ───── */}
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Vendor name *</Label>
        <Combobox
          options={vendorOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Select vendor…"
        />

        <Label className="pt-2">Bill # *</Label>
        <div className="space-y-1">
          <Input
            value={billNumber}
            onChange={(e) => setBillNumber(e.target.value)}
            placeholder="Type the vendor's bill number (e.g. INV-12345)"
            className="font-mono"
            required
          />
          <p className="text-xs text-muted-foreground">
            Bill numbers come from your vendor&apos;s source document and are
            unique per vendor. A warning shows on duplicates.
          </p>
        </div>

        <Label className="pt-2">Order # / Reference</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />

        <Label className="pt-2">Subject</Label>
        <Input
          value={subject ?? ""}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Optional"
        />
      </section>

      {/* ───── Dates + place of supply ───── */}
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Bill date *</Label>
        <DatePicker value={issueDate} onChange={(d) => d && setIssueDate(d)} />

        <Label className="pt-2">Due date *</Label>
        <DatePicker value={dueDate} onChange={(d) => d && setDueDate(d)} />

        <Label className="pt-2">Payment terms</Label>
        <Combobox
          options={paymentTermsOptions}
          value={paymentTermsId}
          onChange={setPaymentTermsId}
          placeholder="Due on Receipt"
        />

        <Label className="pt-2">At transaction level</Label>
        <AtTransactionLevelDropdown
          value={placeOfSupply}
          onChange={setPlaceOfSupply}
        />
      </section>

      {/* ───── Line items ───── */}
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

      {/* ───── Notes / totals ───── */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="bill-notes">Notes</Label>
          <Textarea
            id="bill-notes"
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal-use only — will not appear on PDF."
          />
          <p className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs flex gap-2 items-start">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Notes on a Bill will <strong>not</strong> appear in the PDF —
              bills are an internal A/P record, not a vendor-facing
              document.
            </span>
          </p>

          <Label htmlFor="bill-terms">Terms &amp; conditions</Label>
          <Textarea
            id="bill-terms"
            value={terms ?? ""}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
          />
        </div>
        <div className="rounded-md border p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Label>Document discount</Label>
            <div className="flex items-center gap-1">
              <MoneyInput value={discountValue} onChange={setDiscountValue} />
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
              className="max-w-[10rem]"
            />
            <MoneyInput
              value={adjustmentValue}
              onChange={setAdjustmentValue}
              allowNegative
            />
          </div>
        </div>
      </section>

      {/* ───── Attachments + PDF template ───── */}
      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <AttachFilesField
            initial={attachments}
            onChange={setAttachments}
            maxFiles={10}
            maxSizeMb={10}
            label="Attach files to Bill"
          />
        </div>
        {pdfTemplateOptions.length > 0 ? (
          <PdfTemplatePicker
            templates={pdfTemplateOptions}
            value={pdfTemplateId}
            onChange={setPdfTemplateId}
          />
        ) : null}
      </section>

      {/* ───── Sticky action bar ───── */}
      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
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
              variant="outline"
              onClick={() => submit(true)}
              disabled={busy !== "idle"}
              className="gap-1"
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
        {!isCreate ? null : (
          <div className="ml-auto text-xs text-muted-foreground">
            Bills are never emailed — they&apos;re an internal A/P record.
          </div>
        )}
      </div>
    </div>
  );
}
