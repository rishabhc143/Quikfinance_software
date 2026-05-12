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
import type { RecurringExpenseInput } from "@/lib/validations/recurring-expense";

/**
 * Recurring Expense form per <recurring_expenses_spec>. Intentionally
 * simpler than Recurring Bills — single account + amount, no line
 * items table. Setting a Customer auto-flips isBillable so the
 * generated Expense surfaces on that customer's next Invoice.
 */

const FREQ_OPTIONS: ComboboxOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export type RecurringExpenseFormProps = {
  initial?: Partial<RecurringExpenseInput>;
  vendorOptions: ComboboxOption[];
  customerOptions: ComboboxOption[];
  expenseAccountOptions: ComboboxOption[];
  paidThroughAccountOptions: ComboboxOption[];
  defaultCurrency: string;
  onSubmitAction: (values: RecurringExpenseInput) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
};

export function RecurringExpenseForm({
  initial,
  vendorOptions,
  customerOptions,
  expenseAccountOptions,
  paidThroughAccountOptions,
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save",
  cancelHref = "/purchases/recurring-expenses",
}: RecurringExpenseFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const [profileName, setProfileName] = React.useState(
    initial?.profileName ?? ""
  );
  const [category, setCategory] = React.useState(initial?.category ?? "");
  const [contactId, setContactId] = React.useState<string | null>(
    initial?.contactId ?? null
  );
  const [customerId, setCustomerId] = React.useState<string | null>(
    initial?.customerId ?? null
  );
  const [isBillable, setIsBillable] = React.useState<boolean>(
    initial?.isBillable ?? !!initial?.customerId
  );
  const [expenseAccountId, setExpenseAccountId] = React.useState<
    string | null
  >(initial?.expenseAccountId ?? null);
  const [paidThroughAccountId, setPaidThroughAccountId] = React.useState<
    string | null
  >(initial?.paidThroughAccountId ?? null);
  const [frequency, setFrequency] = React.useState<
    "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
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
  const [amount, setAmount] = React.useState<string>(
    String(initial?.amount ?? "0")
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");

  // Auto-toggle isBillable when customer is set/cleared.
  React.useEffect(() => {
    if (customerId && !isBillable) setIsBillable(true);
    if (!customerId && isBillable) setIsBillable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function submit() {
    if (!profileName.trim()) {
      toast.error("Profile name required");
      return;
    }
    if (!expenseAccountId) {
      toast.error("Pick an expense account");
      return;
    }
    if (!paidThroughAccountId) {
      toast.error("Pick a Paid Through account");
      return;
    }
    const amountNum = Number(amount) || 0;
    if (amountNum <= 0) {
      toast.error("Amount must be positive");
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
        category: category || null,
        contactId,
        customerId,
        isBillable,
        expenseAccountId,
        paidThroughAccountId,
        frequency,
        intervalN,
        startDate: format(startDate, "yyyy-MM-dd") as unknown as Date,
        endDate: endDate
          ? (format(endDate, "yyyy-MM-dd") as unknown as Date)
          : null,
        neverExpires,
        amount: amountNum,
        notes: notes || null,
        status: "ACTIVE",
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
          placeholder="e.g. Weekly office snacks"
          autoFocus
          required
        />

        <Label className="pt-2">Category</Label>
        <Input
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Optional — short label for reports"
        />

        <Label className="pt-2">Repeat every *</Label>
        <div className="grid gap-2 md:grid-cols-[1fr_8rem]">
          <Combobox
            options={FREQ_OPTIONS}
            value={frequency}
            onChange={(v) =>
              setFrequency(
                (v ?? "monthly") as
                  | "daily"
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

        <Label className="pt-2">Expense account *</Label>
        <Combobox
          options={expenseAccountOptions}
          value={expenseAccountId}
          onChange={setExpenseAccountId}
          placeholder="Pick expense account"
        />

        <Label className="pt-2">Amount *</Label>
        <MoneyInput
          value={amount}
          onChange={setAmount}
          currencyCode={defaultCurrency}
        />

        <Label className="pt-2">Paid through *</Label>
        <Combobox
          options={paidThroughAccountOptions}
          value={paidThroughAccountId}
          onChange={setPaidThroughAccountId}
          placeholder="Pick cash/bank account"
        />

        <Label className="pt-2">Vendor</Label>
        <Combobox
          options={vendorOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Optional"
        />

        <Label className="pt-2">Customer</Label>
        <div className="space-y-1">
          <Combobox
            options={customerOptions}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Optional — sets billable"
          />
          {customerId ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Generated expenses will be billable. They appear on the
              customer&apos;s next Invoice via the Billable Expenses panel.
            </p>
          ) : null}
        </div>

        <Label className="pt-2">Notes</Label>
        <Textarea
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Up to 500 characters."
        />
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
      </div>
    </div>
  );
}
