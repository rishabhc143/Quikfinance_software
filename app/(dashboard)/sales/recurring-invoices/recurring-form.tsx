"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import {
  TransactionLineItemsTable,
  type LineItem,
  type ItemOption,
  type TaxOption,
} from "@/components/shared/transaction-line-items-table";
import type { RecurringInvoiceInput } from "@/lib/validations/recurring-invoice";
import { format } from "date-fns";
import { toast } from "sonner";

const FREQUENCIES: ComboboxOption[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "EVERY_N_MONTHS", label: "Every N months" },
  { value: "YEARLY", label: "Yearly" },
];

export type RecurringFormProps = {
  initial?: Partial<RecurringInvoiceInput>;
  initialLines?: LineItem[];
  contactOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  paymentTermsOptions: ComboboxOption[];
  salespersonOptions: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (values: RecurringInvoiceInput) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
};

export function RecurringForm({
  initial,
  initialLines,
  contactOptions,
  itemOptions,
  taxOptions,
  paymentTermsOptions,
  salespersonOptions,
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save profile",
  cancelHref = "/sales/recurring-invoices",
}: RecurringFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [profileName, setProfileName] = React.useState(initial?.profileName ?? "");
  const [contactId, setContactId] = React.useState<string | null>(initial?.contactId ?? null);
  const [frequency, setFrequency] = React.useState<RecurringInvoiceInput["frequency"]>(
    initial?.frequency ?? "MONTHLY"
  );
  const [intervalN, setIntervalN] = React.useState(String(initial?.intervalN ?? 1));
  const [startDate, setStartDate] = React.useState<Date>(
    initial?.startDate ? new Date(initial.startDate as unknown as string) : new Date()
  );
  const [endDate, setEndDate] = React.useState<Date | null>(
    initial?.endDate ? new Date(initial.endDate as unknown as string) : null
  );
  const [neverExpires, setNeverExpires] = React.useState(initial?.neverExpires ?? false);
  const [paymentTermsId, setPaymentTermsId] = React.useState<string | null>(
    initial?.paymentTermsId ?? null
  );
  const [salespersonId, setSalespersonId] = React.useState<string | null>(
    initial?.salespersonId ?? null
  );
  const [emailAutomatically, setEmailAutomatically] = React.useState(
    initial?.emailAutomatically ?? true
  );
  const [discountValue, setDiscountValue] = React.useState(
    String((initial?.documentDiscount?.value as number | undefined) ?? "0")
  );
  const [discountType, setDiscountType] = React.useState<"percentage" | "amount">(
    initial?.documentDiscount?.type ?? "percentage"
  );
  const [adjustmentValue, setAdjustmentValue] = React.useState(
    String((initial?.adjustmentValue as number | undefined) ?? "0")
  );
  const [customerNotes, setCustomerNotes] = React.useState(initial?.customerNotes ?? "");
  const [terms, setTerms] = React.useState(initial?.termsAndConditions ?? "");
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);

  async function submit() {
    if (!profileName.trim()) {
      toast.error("Profile name required");
      return;
    }
    if (!contactId) {
      toast.error("Pick a customer");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(true);
    try {
      await onSubmitAction({
        profileName,
        contactId,
        frequency,
        intervalN: Number(intervalN || 1),
        startDate: format(startDate, "yyyy-MM-dd") as unknown as Date,
        endDate: neverExpires
          ? null
          : endDate
          ? (format(endDate, "yyyy-MM-dd") as unknown as Date)
          : null,
        neverExpires,
        paymentTermsId,
        salespersonId,
        emailAutomatically,
        currency: defaultCurrency,
        documentDiscount: { value: Number(discountValue || 0), type: discountType },
        adjustmentValue: Number(adjustmentValue || 0),
        adjustmentLabel: "Adjustment",
        customerNotes,
        termsAndConditions: terms || null,
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
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Profile Name *</Label>
        <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />

        <Label className="pt-2">Customer *</Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder="Select customer…" />

        <Label className="pt-2">Frequency *</Label>
        <div className="grid gap-2 md:grid-cols-2">
          <Combobox
            options={FREQUENCIES}
            value={frequency}
            onChange={(v) => setFrequency((v as RecurringInvoiceInput["frequency"]) ?? "MONTHLY")}
          />
          {frequency === "EVERY_N_MONTHS" ? (
            <Input
              inputMode="numeric"
              value={intervalN}
              onChange={(e) => setIntervalN(e.target.value)}
              placeholder="N"
            />
          ) : null}
        </div>

        <Label className="pt-2">Start date *</Label>
        <DatePicker value={startDate} onChange={(d) => d && setStartDate(d)} />

        <Label className="pt-2">End date</Label>
        <div className="space-y-2">
          <DatePicker value={endDate} onChange={setEndDate} disabled={neverExpires} />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={neverExpires} onCheckedChange={setNeverExpires} /> Never
            expires
          </label>
        </div>

        <Label className="pt-2">Payment Terms</Label>
        <Combobox
          options={paymentTermsOptions}
          value={paymentTermsId}
          onChange={setPaymentTermsId}
        />

        <Label className="pt-2">Salesperson</Label>
        <Combobox
          options={salespersonOptions}
          value={salespersonId}
          onChange={setSalespersonId}
        />

        <Label className="pt-2">Email automatically</Label>
        <Switch checked={emailAutomatically} onCheckedChange={setEmailAutomatically} />
      </section>

      <TransactionLineItemsTable
        itemOptions={itemOptions}
        taxOptions={taxOptions}
        documentDiscount={{ value: discountValue, type: discountType }}
        adjustment={adjustmentValue}
        onChange={setLines}
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
            <Label>Adjustment</Label>
            <MoneyInput value={adjustmentValue} onChange={setAdjustmentValue} allowNegative />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button type="button" onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
