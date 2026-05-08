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
import {
  TransactionLineItemsTable,
  type LineItem,
  type ItemOption,
  type TaxOption,
} from "@/components/shared/transaction-line-items-table";
import { CustomFieldsSection } from "@/components/shared/custom-fields-section";
import { createCustomerInlineAction } from "@/app/(dashboard)/sales/_inline-create/actions";
import type { DebitNoteInput } from "@/lib/validations/debit-note";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * M23: Debit Note form. Mirrors CreditNoteForm but smaller —
 * Debit Notes don't carry attachments (schema doesn't track them
 * yet) or PDF template picking; both can be added when those
 * surfaces ship.
 */

const REASONS: ComboboxOption[] = [
  { value: "Late Fee", label: "Late Fee" },
  { value: "Escalation Charge", label: "Escalation Charge" },
  { value: "Price Adjustment", label: "Price Adjustment" },
  { value: "Other", label: "Other" },
];

export function DebitNoteForm({
  initial,
  initialLines,
  contactOptions,
  itemOptions,
  taxOptions,
  defaultCurrency,
  customFieldDefinitions = [],
  customFieldInitialValues = {},
  onSubmitAction,
  submitLabel = "Save",
  cancelHref = "/sales/debit-notes",
}: {
  initial?: Partial<DebitNoteInput>;
  initialLines?: LineItem[];
  contactOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  defaultCurrency: string;
  // M25: optional Custom Fields wiring (entityType=DEBIT_NOTE)
  customFieldDefinitions?: {
    id: string;
    fieldKey: string;
    label: string;
    dataType:
      | "text"
      | "number"
      | "date"
      | "dropdown"
      | "checkbox"
      | "email"
      | "url";
    options: { label: string; value: string }[] | null;
    isRequired: boolean;
  }[];
  customFieldInitialValues?: Record<string, unknown>;
  onSubmitAction: (values: DebitNoteInput) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [contactId, setContactId] = React.useState<string | null>(initial?.contactId ?? null);
  const [referenceNumber, setReferenceNumber] = React.useState(initial?.referenceNumber ?? "");
  const [debitNoteDate, setDebitNoteDate] = React.useState<Date>(
    initial?.debitNoteDate
      ? new Date(initial.debitNoteDate as unknown as string)
      : new Date()
  );
  const initialReasonInList = REASONS.some((r) => r.value === initial?.reason);
  const [reason, setReason] = React.useState<string | null>(
    initial?.reason ? (initialReasonInList ? initial.reason : "Other") : null
  );
  const [otherReason, setOtherReason] = React.useState(
    initial?.reason && !initialReasonInList ? initial.reason : ""
  );
  const [customerNotes, setCustomerNotes] = React.useState(initial?.customerNotes ?? "");
  const [terms, setTerms] = React.useState(initial?.termsAndConditions ?? "");
  const [contactsState, setContactsState] = React.useState(contactOptions);
  const [lines, setLines] = React.useState<LineItem[]>(initialLines ?? []);
  // M25: Custom Fields state — keyed by fieldDefinitionId
  const [customFieldValues, setCustomFieldValues] = React.useState<
    Record<string, unknown>
  >(customFieldInitialValues);

  async function submit() {
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
        contactId,
        referenceNumber: referenceNumber || null,
        debitNoteDate: format(debitNoteDate, "yyyy-MM-dd") as unknown as Date,
        reason: reason === "Other" ? otherReason || null : reason,
        currency: defaultCurrency,
        customerNotes,
        termsAndConditions: terms || null,
        // M25: include any populated custom-field values
        customFieldValues: Object.entries(customFieldValues)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([fieldDefinitionId, value]) => ({
            fieldDefinitionId,
            value,
          })),
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
        <Label className="pt-2">Customer *</Label>
        <Combobox
          options={contactsState}
          value={contactId}
          onChange={setContactId}
          placeholder="Select customer…"
          allowCreate
          onCreate={async (input: string) => {
            try {
              const created = await createCustomerInlineAction({
                displayName: input,
                email: null,
              });
              setContactsState((prev) => [
                ...prev,
                { value: created.id, label: created.displayName },
              ]);
              setContactId(created.id);
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Couldn't add customer"
              );
            }
          }}
        />

        <Label className="pt-2">Reference #</Label>
        <Input
          value={referenceNumber ?? ""}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Optional"
        />

        <Label className="pt-2">Date *</Label>
        <DatePicker value={debitNoteDate} onChange={(d) => d && setDebitNoteDate(d)} />

        <Label className="pt-2">Reason</Label>
        <div className="space-y-2">
          <Combobox
            options={REASONS}
            value={reason}
            onChange={setReason}
            placeholder="Select reason"
          />
          {reason === "Other" ? (
            <Input
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Specify reason"
            />
          ) : null}
        </div>
      </section>

      <TransactionLineItemsTable
        itemOptions={itemOptions}
        taxOptions={taxOptions}
        onChange={setLines}
        initialLines={initialLines}
      />

      {customFieldDefinitions.length > 0 ? (
        <CustomFieldsSection
          entityType="DEBIT_NOTE"
          definitions={customFieldDefinitions}
          values={customFieldValues}
          onChange={setCustomFieldValues}
          defaultOpen
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="customer-notes">Customer notes</Label>
          <Textarea
            id="customer-notes"
            value={customerNotes ?? ""}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="terms">Terms &amp; Conditions</Label>
          <Textarea
            id="terms"
            value={terms ?? ""}
            onChange={(e) => setTerms(e.target.value)}
            rows={3}
          />
        </div>
      </section>

      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
