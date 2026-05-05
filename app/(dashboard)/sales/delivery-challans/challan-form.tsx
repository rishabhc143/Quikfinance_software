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
import type { DeliveryChallanInput } from "@/lib/validations/delivery-challan";
import { format } from "date-fns";
import { toast } from "sonner";

const CHALLAN_TYPES: ComboboxOption[] = [
  { value: "job_work", label: "Job work" },
  { value: "supply_on_approval", label: "Supply on approval" },
  { value: "supply_for_liquid_gas", label: "Supply for liquid gas" },
  { value: "others", label: "Others" },
];

export function ChallanForm({
  contactOptions,
  itemOptions,
  taxOptions,
  onSubmitAction,
  cancelHref = "/sales/delivery-challans",
}: {
  contactOptions: ComboboxOption[];
  itemOptions: ItemOption[];
  taxOptions: TaxOption[];
  onSubmitAction: (values: DeliveryChallanInput) => Promise<unknown>;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [challanDate, setChallanDate] = React.useState<Date>(new Date());
  const [challanType, setChallanType] = React.useState<DeliveryChallanInput["challanType"]>("others");
  const [customerNotes, setCustomerNotes] = React.useState("");
  const [terms, setTerms] = React.useState("");
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
        challanDate: format(challanDate, "yyyy-MM-dd") as unknown as Date,
        challanType,
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
        <Label className="pt-2">Customer *</Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder="Select customer…" />

        <Label className="pt-2">Reference #</Label>
        <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />

        <Label className="pt-2">Challan date *</Label>
        <DatePicker value={challanDate} onChange={(d) => d && setChallanDate(d)} />

        <Label className="pt-2">Challan type *</Label>
        <Combobox
          options={CHALLAN_TYPES}
          value={challanType}
          onChange={(v) => setChallanType((v as DeliveryChallanInput["challanType"]) ?? "others")}
        />
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
