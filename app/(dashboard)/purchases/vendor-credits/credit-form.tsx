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
import {
  TransactionLineItemsTable,
  type LineItem,
  type ItemOption,
  type TaxOption,
  type AccountOption,
} from "@/components/shared/transaction-line-items-table";
import { AtTransactionLevelDropdown } from "@/components/shared/at-transaction-level-dropdown";
import type { VendorCreditInput } from "@/lib/validations/vendor-credit";

/**
 * Vendor Credit create/edit form per <vendor_credits_spec>.
 *
 * Same multi-line structure as PO/Bill but vendor-credit specific:
 *  - Auto-generated CN- number (read-only, server peeks)
 *  - No "Save and Send" — vendor credits aren't emailed
 *  - No billable-to-customer column (credits don't pass through)
 *  - Status: Save as Draft | Save as Open | Cancel
 */

export type CreditFormProps = {
  initial?: Partial<VendorCreditInput>;
  initialLines?: LineItem[];
  nextNumber: string;
  vendorOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  defaultCurrency: string;
  onSubmitAction: (
    values: VendorCreditInput,
    opts?: { open?: boolean }
  ) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
  isCreate?: boolean;
  singleAction?: boolean;
};

export function CreditForm({
  initial,
  initialLines,
  nextNumber,
  vendorOptions,
  itemOptions,
  taxOptions,
  accountOptions,
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save as Draft",
  cancelHref = "/purchases/vendor-credits",
  isCreate = true,
  singleAction = false,
}: CreditFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "draft" | "open">("idle");
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initial?.referenceNumber ?? ""
  );
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [date, setDate] = React.useState<Date>(
    initial?.date ? new Date(initial.date as unknown as string) : new Date()
  );
  const [placeOfSupply, setPlaceOfSupply] = React.useState<string | null>(
    initial?.placeOfSupply ?? null
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [reason, setReason] = React.useState(initial?.reason ?? "");
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);

  async function submit(open: boolean) {
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.name)) {
      toast.error("Add at least one line item");
      return;
    }
    setBusy(open ? "open" : "draft");
    const payload: VendorCreditInput = {
      contactId,
      referenceNumber: referenceNumber || null,
      subject: subject || null,
      date: format(date, "yyyy-MM-dd") as unknown as Date,
      placeOfSupply,
      status: singleAction ? (initial?.status ?? "DRAFT") : open ? "OPEN" : "DRAFT",
      currency: defaultCurrency,
      reason: reason || null,
      notes: notes || null,
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
          rate: Number(l.rate || 0),
          taxId: l.taxId ?? null,
        })),
    };
    try {
      await onSubmitAction(payload, { open });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy("idle");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Vendor name *</Label>
        <Combobox
          options={vendorOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Select vendor…"
        />

        <Label className="pt-2">Credit Note # *</Label>
        <Input
          value={isCreate ? nextNumber : "(unchanged)"}
          disabled
          className="font-mono"
        />

        <Label className="pt-2">Order # / Reference</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />

        <Label className="pt-2">Date *</Label>
        <DatePicker value={date} onChange={(d) => d && setDate(d)} />

        <Label className="pt-2">Subject</Label>
        <Input
          value={subject ?? ""}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Optional"
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
        columnConfig={{
          accountColumnVisible: "inline",
          customerColumnVisible: false,
        }}
        onChange={(ls) => setLines(ls)}
        initialLines={initialLines}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="reason">Reason</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Goods returned, pricing error"
          />
          <Label htmlFor="vc-notes">Notes</Label>
          <Textarea
            id="vc-notes"
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Will be shown on the vendor credit."
          />
        </div>
      </section>

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
      </div>
    </div>
  );
}
