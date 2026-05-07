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
import { AttachFilesField, type AttachedFile } from "@/components/shared/attach-files-field";
import { PdfTemplatePicker } from "@/components/shared/pdf-template-picker";
import { createCustomerInlineAction } from "@/app/(dashboard)/sales/_inline-create/actions";
import type { CreditNoteInput } from "@/lib/validations/credit-note";
import { format } from "date-fns";
import { toast } from "sonner";

const REASONS: ComboboxOption[] = [
  { value: "Damaged Goods", label: "Damaged Goods" },
  { value: "Sales Return", label: "Sales Return" },
  { value: "Discount", label: "Discount" },
  { value: "Other", label: "Other" },
];

export function CreditNoteForm({
  contactOptions,
  itemOptions,
  taxOptions,
  pdfTemplateOptions = [],
  defaultCurrency,
  onSubmitAction,
  cancelHref = "/sales/credit-notes",
}: {
  contactOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  pdfTemplateOptions?: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (values: CreditNoteInput) => Promise<unknown>;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [creditNoteDate, setCreditNoteDate] = React.useState<Date>(new Date());
  const [reason, setReason] = React.useState<string | null>(null);
  const [otherReason, setOtherReason] = React.useState("");
  const [customerNotes, setCustomerNotes] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(null);
  const [attachments, setAttachments] = React.useState<AttachedFile[]>([]);
  const [contactsState, setContactsState] = React.useState(contactOptions);
  const [lines, setLines] = React.useState<LineItem[]>([]);

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
        creditNoteDate: format(creditNoteDate, "yyyy-MM-dd") as unknown as Date,
        reason: reason === "Other" ? otherReason || null : reason,
        currency: defaultCurrency,
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
              toast.error(err instanceof Error ? err.message : "Couldn't add customer");
            }
          }}
        />

        <Label className="pt-2">Reference #</Label>
        <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />

        <Label className="pt-2">Date *</Label>
        <DatePicker value={creditNoteDate} onChange={(d) => d && setCreditNoteDate(d)} />

        <Label className="pt-2">Reason</Label>
        <div className="space-y-2">
          <Combobox options={REASONS} value={reason} onChange={setReason} placeholder="Select reason" />
          {reason === "Other" ? (
            <Input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Specify reason" />
          ) : null}
        </div>
      </section>

      <TransactionLineItemsTable
        itemOptions={itemOptions}
        taxOptions={taxOptions}
        onChange={setLines}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label>Customer notes</Label>
          <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} />
        </div>
        <div className="space-y-3">
          <Label>Terms & Conditions</Label>
          <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <AttachFilesField
            initial={attachments}
            onChange={setAttachments}
            maxFiles={10}
            maxSizeMb={10}
            label="Attach files to Credit Note"
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
        <Button onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
        <Button variant="ghost" onClick={() => router.push(cancelHref)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
