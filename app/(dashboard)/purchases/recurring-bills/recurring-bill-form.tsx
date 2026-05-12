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
import { Switch } from "@/components/ui/switch";
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
import type { RecurringBillInput } from "@/lib/validations/recurring-bill";

/**
 * Recurring Bill create/edit form per <recurring_bills_spec>.
 *
 * Multi-line like Bill (PR #92), but persists everything onto
 * `RecurringBill.templateJson`. The daily cron unpacks the template
 * and creates a Bill + BillLineItem rows on schedule.
 *
 * No "Save and Send" — recurring bills generate DRAFT bills that
 * the user reviews + opens manually.
 */

const FREQ_OPTIONS: ComboboxOption[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export type RecurringBillFormProps = {
  initial?: Partial<RecurringBillInput>;
  initialLines?: LineItem[];
  vendorOptions: ComboboxOption[];
  customerOptions: CustomerOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  paymentTermsOptions: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (values: RecurringBillInput) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
};

export function RecurringBillForm({
  initial,
  initialLines,
  vendorOptions,
  customerOptions,
  itemOptions,
  taxOptions,
  accountOptions,
  paymentTermsOptions,
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save",
  cancelHref = "/purchases/recurring-bills",
}: RecurringBillFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const [profileName, setProfileName] = React.useState(
    initial?.profileName ?? ""
  );
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initial?.referenceNumber ?? ""
  );
  const [frequency, setFrequency] = React.useState<
    "weekly" | "monthly" | "quarterly" | "yearly"
  >(initial?.frequency ?? "monthly");
  const [intervalN, setIntervalN] = React.useState<number>(
    initial?.intervalN ?? 1
  );
  const [startDate, setStartDate] = React.useState<Date>(
    initial?.startDate
      ? new Date(initial.startDate as unknown as string)
      : new Date()
  );
  const [neverExpires, setNeverExpires] = React.useState<boolean>(
    initial?.neverExpires ?? true
  );
  const [endDate, setEndDate] = React.useState<Date | null>(
    initial?.endDate
      ? new Date(initial.endDate as unknown as string)
      : null
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
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);

  async function submit() {
    if (!profileName.trim()) {
      toast.error("Profile name required");
      return;
    }
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    if (!neverExpires && !endDate) {
      toast.error("Pick an end date or check Never Expires");
      return;
    }
    setBusy(true);
    try {
      await onSubmitAction({
        profileName: profileName.trim(),
        contactId,
        referenceNumber: referenceNumber || null,
        frequency,
        intervalN,
        startDate: format(startDate, "yyyy-MM-dd") as unknown as Date,
        endDate: endDate
          ? (format(endDate, "yyyy-MM-dd") as unknown as Date)
          : null,
        neverExpires,
        paymentTermsId,
        placeOfSupply,
        currency: defaultCurrency,
        documentDiscount: {
          value: Number(discountValue || 0),
          type: discountType,
        },
        adjustmentLabel,
        adjustmentValue: Number(adjustmentValue || 0),
        notes,
        termsAndConditions: terms || null,
        status: "ACTIVE",
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
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Profile name *</Label>
        <Input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="e.g. Monthly office rent"
          required
        />

        <Label className="pt-2">Vendor name *</Label>
        <Combobox
          options={vendorOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Select vendor…"
        />

        <Label className="pt-2">Order # / Reference</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />
      </section>

      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Frequency *</Label>
        <div className="grid gap-2 md:grid-cols-[1fr_8rem]">
          <Combobox
            options={FREQ_OPTIONS}
            value={frequency}
            onChange={(v) =>
              setFrequency(
                (v ?? "monthly") as
                  | "weekly"
                  | "monthly"
                  | "quarterly"
                  | "yearly"
              )
            }
          />
          <Input
            type="number"
            min={1}
            value={intervalN}
            onChange={(e) =>
              setIntervalN(Math.max(1, Number(e.target.value) || 1))
            }
            title="Interval — e.g. every 2 weeks"
          />
        </div>

        <Label className="pt-2">Start date *</Label>
        <DatePicker value={startDate} onChange={(d) => d && setStartDate(d)} />

        <Label className="pt-2">End</Label>
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <Switch
              checked={neverExpires}
              onCheckedChange={(v) => {
                setNeverExpires(v);
                if (v) setEndDate(null);
              }}
            />
            Never expires
          </label>
          {!neverExpires ? (
            <DatePicker value={endDate} onChange={setEndDate} />
          ) : null}
        </div>

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

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="rb-notes">Notes</Label>
          <Textarea
            id="rb-notes"
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal — not on the generated Bill PDF."
          />
          <Label htmlFor="rb-terms">Terms &amp; conditions</Label>
          <Textarea
            id="rb-terms"
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
                  setDiscountType(
                    e.target.value as "percentage" | "amount"
                  )
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

      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(cancelHref)}
        >
          Cancel
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          Generated bills land as Draft — review and Mark Open in the
          Bills list.
        </div>
      </div>
    </div>
  );
}
