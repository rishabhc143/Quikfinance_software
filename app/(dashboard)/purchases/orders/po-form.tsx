"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
} from "@/components/shared/transaction-line-items-table";
import { AtTransactionLevelDropdown } from "@/components/shared/at-transaction-level-dropdown";
import { AttachFilesField, type AttachedFile } from "@/components/shared/attach-files-field";
import { PdfTemplatePicker } from "@/components/shared/pdf-template-picker";
import type { PurchaseOrderInput } from "@/lib/validations/purchase-order";

/**
 * Purchase Order create/edit form.
 *
 * Mirrors `app/(dashboard)/sales/orders/sales-order-form.tsx` but
 * vendor-side:
 *   - Vendor combobox (filtered type=VENDOR at the page level).
 *   - Delivery Address mode radio: Organization (default) | Customer.
 *     When CUSTOMER, exposes a Customer combobox so we can drop-ship
 *     to that customer's address.
 *   - `<AtTransactionLevelDropdown>` → placeOfSupply.
 *   - Line items table runs with `accountColumnVisible="inline"` so
 *     each line has its own GL account picker (the column moves out
 *     of the expand row).
 *   - Bottom bar: Save as Draft | Save and Send | Cancel.
 *
 * State is local React state (matches the SO form's pattern; we
 * don't use react-hook-form here because the line-items table owns
 * the line-array state internally and exposes it via `onChange`).
 */

export type PurchaseOrderFormProps = {
  initial?: Partial<PurchaseOrderInput>;
  initialLines?: LineItem[];
  /** Pre-fetched next PO# from getNextDocumentNumber peek. */
  nextNumber: string;
  vendorOptions: ComboboxOption[];
  customerOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  paymentTermsOptions: ComboboxOption[];
  pdfTemplateOptions?: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (
    values: PurchaseOrderInput,
    opts?: { send?: boolean }
  ) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
  /** When true, the parent has signaled this is the New form (vs
   *  Edit) — we render the auto-generated PO# read-only. Edit screen
   *  passes false so the user can see what was assigned. */
  isCreate?: boolean;
};

export function PurchaseOrderForm({
  initial,
  initialLines,
  nextNumber,
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
  cancelHref = "/purchases/orders",
  isCreate = true,
}: PurchaseOrderFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "draft" | "send">("idle");

  // Form state.
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initial?.referenceNumber ?? ""
  );
  const [orderDate, setOrderDate] = React.useState<Date>(
    initial?.orderDate ? new Date(initial.orderDate as unknown as string) : new Date()
  );
  const [deliveryDate, setDeliveryDate] = React.useState<Date | null>(
    initial?.deliveryDate
      ? new Date(initial.deliveryDate as unknown as string)
      : null
  );
  const [paymentTermsId, setPaymentTermsId] = React.useState<string | null>(
    initial?.paymentTermsId ?? null
  );
  const [deliveryAddressMode, setDeliveryAddressMode] = React.useState<
    "ORGANIZATION" | "CUSTOMER"
  >(initial?.deliveryAddressMode ?? "ORGANIZATION");
  const [deliveryToCustomerId, setDeliveryToCustomerId] = React.useState<
    string | null
  >(initial?.deliveryToCustomerId ?? null);
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
  const [notes, setNotes] = React.useState(
    initial?.notes ?? "Will be displayed on purchase order"
  );
  const [terms, setTerms] = React.useState(initial?.termsAndConditions ?? "");
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial?.pdfTemplateId ?? null
  );
  const [attachments, setAttachments] = React.useState<AttachedFile[]>(
    (initial?.attachments as AttachedFile[] | undefined) ?? []
  );
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);

  async function submit(send: boolean) {
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(send ? "send" : "draft");
    const payload: PurchaseOrderInput = {
      contactId,
      referenceNumber: referenceNumber || null,
      orderDate: format(orderDate, "yyyy-MM-dd") as unknown as Date,
      deliveryDate: deliveryDate
        ? (format(deliveryDate, "yyyy-MM-dd") as unknown as Date)
        : null,
      paymentTermsId,
      deliveryAddressMode,
      deliveryToCustomerId:
        deliveryAddressMode === "CUSTOMER" ? deliveryToCustomerId : null,
      placeOfSupply,
      status: send ? "ISSUED" : "DRAFT",
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
          quantity: Number(l.quantity || 0),
          unit: l.unit ?? null,
          rate: Number(l.rate || 0),
          discount: Number(l.discount || 0),
          discountType: l.discountType ?? "percentage",
          taxId: l.taxId ?? null,
        })),
    };
    try {
      await onSubmitAction(payload, { send });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
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

        <Label className="pt-2">Delivery address</Label>
        <div className="space-y-2">
          <div className="flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="deliveryAddressMode"
                value="ORGANIZATION"
                checked={deliveryAddressMode === "ORGANIZATION"}
                onChange={() => setDeliveryAddressMode("ORGANIZATION")}
              />
              Organization
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="deliveryAddressMode"
                value="CUSTOMER"
                checked={deliveryAddressMode === "CUSTOMER"}
                onChange={() => setDeliveryAddressMode("CUSTOMER")}
              />
              Customer (drop-ship)
            </label>
          </div>
          {deliveryAddressMode === "CUSTOMER" ? (
            <Combobox
              options={customerOptions}
              value={deliveryToCustomerId}
              onChange={setDeliveryToCustomerId}
              placeholder="Pick the destination customer…"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Goods will be delivered to your organization&apos;s address.
            </p>
          )}
        </div>
      </section>

      {/* ───── Body fields ───── */}
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Purchase order # *</Label>
        <Input
          value={isCreate ? nextNumber : "(unchanged)"}
          disabled
          className="font-mono"
        />

        <Label className="pt-2">Reference #</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />

        <Label className="pt-2">Date *</Label>
        <DatePicker
          value={orderDate}
          onChange={(d) => d && setOrderDate(d)}
        />

        <Label className="pt-2">Delivery date</Label>
        <DatePicker value={deliveryDate} onChange={setDeliveryDate} />

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
        columnConfig={{
          accountColumnVisible: "inline",
          customerColumnVisible: false,
        }}
        documentDiscount={{ value: discountValue, type: discountType }}
        adjustment={adjustmentValue}
        onChange={(ls) => setLines(ls)}
        initialLines={initialLines}
      />

      {/* ───── Notes / totals ───── */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="po-notes">Notes</Label>
          <Textarea
            id="po-notes"
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Will be displayed on purchase order"
          />
          <Label htmlFor="po-terms">Terms &amp; Conditions</Label>
          <Textarea
            id="po-terms"
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
            label="Attach files to Purchase Order"
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
          {busy === "send" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Save and Send
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(cancelHref)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
