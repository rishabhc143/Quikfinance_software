"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
} from "@/components/shared/transaction-line-items-table";
import { AttachFilesField, type AttachedFile } from "@/components/shared/attach-files-field";
import { PdfTemplatePicker } from "@/components/shared/pdf-template-picker";
import type { SalesOrderInput } from "@/lib/validations/sales-order";
import { format } from "date-fns";
import { toast } from "sonner";

export type SalesOrderFormProps = {
  initial?: Partial<SalesOrderInput>;
  initialLines?: LineItem[];
  nextNumber: string;
  contactOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  salespersonOptions: ComboboxOption[];
  paymentTermsOptions: ComboboxOption[];
  deliveryMethodOptions: ComboboxOption[];
  pdfTemplateOptions?: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (
    values: SalesOrderInput,
    opts?: { send?: boolean }
  ) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
};

export function SalesOrderForm({
  initial,
  initialLines,
  nextNumber,
  contactOptions,
  itemOptions,
  taxOptions,
  salespersonOptions,
  paymentTermsOptions,
  deliveryMethodOptions,
  pdfTemplateOptions = [],
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save as Draft",
  cancelHref = "/sales/orders",
}: SalesOrderFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "draft" | "send">("idle");
  const [contactId, setContactId] = React.useState<string | null>(initial?.contactId ?? null);
  const [referenceNumber, setReferenceNumber] = React.useState(initial?.referenceNumber ?? "");
  const [orderDate, setOrderDate] = React.useState<Date>(
    initial?.orderDate ? new Date(initial.orderDate as unknown as string) : new Date()
  );
  const [expectedShipmentDate, setExpectedShipmentDate] = React.useState<Date | null>(
    initial?.expectedShipmentDate ? new Date(initial.expectedShipmentDate as unknown as string) : null
  );
  const [paymentTermsId, setPaymentTermsId] = React.useState<string | null>(
    initial?.paymentTermsId ?? null
  );
  const [deliveryMethodId, setDeliveryMethodId] = React.useState<string | null>(
    initial?.deliveryMethodId ?? null
  );
  const [salespersonId, setSalespersonId] = React.useState<string | null>(
    initial?.salespersonId ?? null
  );
  const [discountValue, setDiscountValue] = React.useState(
    String((initial?.documentDiscount?.value as number | undefined) ?? "0")
  );
  const [discountType, setDiscountType] = React.useState<"percentage" | "amount">(
    initial?.documentDiscount?.type ?? "percentage"
  );
  const [adjustmentLabel, setAdjustmentLabel] = React.useState(
    initial?.adjustmentLabel ?? "Adjustment"
  );
  const [adjustmentValue, setAdjustmentValue] = React.useState(
    String((initial?.adjustmentValue as number | undefined) ?? "0")
  );
  const [customerNotes, setCustomerNotes] = React.useState(
    initial?.customerNotes ?? "Enter any notes to be displayed in your transaction"
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
      toast.error("Pick a customer");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(send ? "send" : "draft");
    const payload: SalesOrderInput = {
      contactId,
      referenceNumber: referenceNumber || null,
      orderDate: format(orderDate, "yyyy-MM-dd") as unknown as Date,
      expectedShipmentDate: expectedShipmentDate
        ? (format(expectedShipmentDate, "yyyy-MM-dd") as unknown as Date)
        : null,
      paymentTermsId,
      deliveryMethodId,
      salespersonId,
      status: send ? "CONFIRMED" : "DRAFT",
      currency: defaultCurrency,
      documentDiscount: { value: Number(discountValue || 0), type: discountType },
      adjustmentLabel,
      adjustmentValue: Number(adjustmentValue || 0),
      customerNotes,
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
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Customer Name *</Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder="Select customer…" />

        <Label className="pt-2">Sales Order #</Label>
        <Input value={initial ? "(unchanged)" : nextNumber} disabled className="font-mono" />

        <Label className="pt-2">Reference #</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />

        <Label className="pt-2">Sales Order Date *</Label>
        <DatePicker value={orderDate} onChange={(d) => d && setOrderDate(d)} />

        <Label className="pt-2">Expected Shipment Date</Label>
        <DatePicker value={expectedShipmentDate} onChange={setExpectedShipmentDate} />

        <Label className="pt-2">Payment Terms</Label>
        <Combobox
          options={paymentTermsOptions}
          value={paymentTermsId}
          onChange={setPaymentTermsId}
          placeholder="Due on Receipt"
        />

        <Label className="pt-2">Delivery Method</Label>
        <Combobox
          options={deliveryMethodOptions}
          value={deliveryMethodId}
          onChange={setDeliveryMethodId}
          placeholder="Select delivery method"
        />

        <Label className="pt-2">Salesperson</Label>
        <Combobox
          options={salespersonOptions}
          value={salespersonId}
          onChange={setSalespersonId}
          placeholder="Optional"
        />
      </section>

      <TransactionLineItemsTable
        itemOptions={itemOptions}
        taxOptions={taxOptions}
        documentDiscount={{ value: discountValue, type: discountType }}
        adjustment={adjustmentValue}
        onChange={(ls) => setLines(ls)}
        initialLines={initialLines}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="customer-notes">Customer Notes</Label>
          <Textarea
            id="customer-notes"
            value={customerNotes ?? ""}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
          />
          <Label htmlFor="terms">Terms &amp; Conditions</Label>
          <Textarea id="terms" value={terms ?? ""} onChange={(e) => setTerms(e.target.value)} rows={3} />
        </div>
        <div className="rounded-md border p-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Label>Document discount</Label>
            <div className="flex items-center gap-1">
              <MoneyInput value={discountValue} onChange={setDiscountValue} />
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percentage" | "amount")}
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
            <MoneyInput value={adjustmentValue} onChange={setAdjustmentValue} allowNegative />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <AttachFilesField
            initial={attachments}
            onChange={setAttachments}
            maxFiles={10}
            maxSizeMb={5}
            label="Attach files to Sales Order"
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

      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button type="button" onClick={() => submit(false)} disabled={busy !== "idle"} className="gap-1">
          {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => submit(true)} disabled={busy !== "idle"} className="gap-1">
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save and Send
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
