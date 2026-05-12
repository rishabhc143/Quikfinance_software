"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eraser, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { PartnerBankPromo } from "@/components/shared/partner-bank-promo";
import { formatMoney } from "@/lib/money";
import {
  PAYMENT_MODES,
  type BillPaymentInput,
  type VendorAdvanceInput,
} from "@/lib/validations/payment-made";

/**
 * Two-tab Record Payment form per <payments_made_spec>:
 *
 *   Bill Payment (default) — settle one or more open bills. Allocation
 *     table loads on vendor change. When the vendor has an available
 *     Vendor Advance balance, a "Use Vendor Advance" row appears at
 *     the top of the allocation table and lets the user draw down.
 *     Excess (payment > sum of allocations) is recorded as a new
 *     advance automatically.
 *
 *   Vendor Advance — pay the vendor without applying to a bill.
 *     Money lands in a "Prepaid Expenses" account; available to draw
 *     against future bills.
 *
 * The form persists nothing until Save — switching tabs preserves
 * per-tab state.
 */

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  credit_card: "Credit card",
  upi: "UPI",
  other: "Other",
};

type OpenBill = {
  id: string;
  number: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  dueDate: Date;
  issueDate: Date;
  purchaseOrderNumber: string | null;
};

type AdvanceRow = {
  paymentMadeId: string;
  number: string;
  paymentDate: Date;
  originalAmount: number;
  used: number;
  remaining: number;
};

export type PaymentMadeFormProps = {
  vendorOptions: ComboboxOption[];
  accountOptions: ComboboxOption[];
  tdsOptions: ComboboxOption[];
  currency: string;
  /** Optional ?vendor=xxx + ?bill=xxx pre-selections from the URL. */
  defaultVendorId?: string | null;
  defaultBillId?: string | null;
  loadOpenBillsAction: (input: { vendorId: string }) => Promise<OpenBill[]>;
  loadAdvanceBalanceAction: (input: { vendorId: string }) => Promise<{
    totalBalance: number;
    advances: AdvanceRow[];
  }>;
  createBillPaymentAction: (input: BillPaymentInput) => Promise<unknown>;
  createVendorAdvanceAction: (input: VendorAdvanceInput) => Promise<unknown>;
};

type Tab = "BILL_PAYMENT" | "VENDOR_ADVANCE";

export function PaymentMadeForm({
  vendorOptions,
  accountOptions,
  tdsOptions,
  currency,
  defaultVendorId,
  defaultBillId,
  loadOpenBillsAction,
  loadAdvanceBalanceAction,
  createBillPaymentAction,
  createVendorAdvanceAction,
}: PaymentMadeFormProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("BILL_PAYMENT");
  const [busy, setBusy] = React.useState<"idle" | "draft" | "paid">("idle");

  // ───── Shared state ─────────────────────────────────────────────
  const [contactId, setContactId] = React.useState<string | null>(
    defaultVendorId ?? null
  );
  const [paymentDate, setPaymentDate] = React.useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = React.useState<
    (typeof PAYMENT_MODES)[number]
  >("cash");
  const [paidThroughAccountId, setPaidThroughAccountId] = React.useState<
    string | null
  >(null);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // ───── Bill Payment tab state ──────────────────────────────────
  const [paymentAmount, setPaymentAmount] = React.useState<string>("0");
  const [openBills, setOpenBills] = React.useState<OpenBill[]>([]);
  const [advanceBalance, setAdvanceBalance] = React.useState<{
    totalBalance: number;
    advances: AdvanceRow[];
  }>({ totalBalance: 0, advances: [] });
  /**
   * allocations is keyed by `${source}:${id}` so the table can have
   * BOTH a row for "draw from advance X" AND a row for "pay bill Y
   * with fresh cash" without colliding. For drawdowns the inner key
   * is the source advance id; for fresh allocations the inner key is
   * the bill id.
   */
  const [allocations, setAllocations] = React.useState<
    Record<string, number>
  >({});
  const [loadingBills, setLoadingBills] = React.useState(false);

  // ───── Vendor Advance tab state ────────────────────────────────
  const [advanceAmount, setAdvanceAmount] = React.useState<string>("0");
  const [depositToAccountId, setDepositToAccountId] = React.useState<
    string | null
  >(null);
  const [tdsId, setTdsId] = React.useState<string | null>(null);
  const [tdsAmount, setTdsAmount] = React.useState<string>("0");

  // ───── Load open bills + advance balance when vendor changes ───
  React.useEffect(() => {
    if (!contactId) {
      setOpenBills([]);
      setAdvanceBalance({ totalBalance: 0, advances: [] });
      setAllocations({});
      return;
    }
    let cancelled = false;
    setLoadingBills(true);
    Promise.all([
      loadOpenBillsAction({ vendorId: contactId }),
      loadAdvanceBalanceAction({ vendorId: contactId }),
    ])
      .then(([bills, balance]) => {
        if (cancelled) return;
        setOpenBills(bills);
        setAdvanceBalance(balance);
        // Pre-allocate the requested bill if URL param set.
        if (defaultBillId) {
          const b = bills.find((x) => x.id === defaultBillId);
          if (b) {
            setAllocations({ [`FRESH:${b.id}`]: b.amountDue });
            setPaymentAmount(String(b.amountDue));
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setOpenBills([]);
        setAdvanceBalance({ totalBalance: 0, advances: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingBills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, defaultBillId, loadOpenBillsAction, loadAdvanceBalanceAction]);

  // ───── Bill Payment computed totals ────────────────────────────
  const freshSum = Object.entries(allocations)
    .filter(([k]) => k.startsWith("FRESH:"))
    .reduce((s, [, v]) => s + (Number.isFinite(v) ? v : 0), 0);
  const advanceSum = Object.entries(allocations)
    .filter(([k]) => k.startsWith("ADVANCE:"))
    .reduce((s, [, v]) => s + (Number.isFinite(v) ? v : 0), 0);
  const amountForBills = freshSum + advanceSum;
  const paymentMadeNum = Number(paymentAmount) || 0;
  const amountInExcess = Math.max(0, paymentMadeNum - amountForBills);

  function setAlloc(key: string, value: number) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!value || value < 0.001) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function clearAllocations() {
    setAllocations({});
  }

  async function submitBillPayment(status: "DRAFT" | "PAID") {
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    if (paymentMadeNum <= 0) {
      toast.error("Enter a payment amount");
      return;
    }
    if (amountForBills <= 0) {
      toast.error("Allocate to at least one bill");
      return;
    }
    setBusy(status === "DRAFT" ? "draft" : "paid");
    try {
      await createBillPaymentAction({
        paymentType: "BILL_PAYMENT",
        contactId,
        paymentDate,
        amountPaid: paymentMadeNum,
        paymentMode,
        paidThroughAccountId,
        reference: reference || null,
        notes: notes || null,
        attachments: [],
        status,
        allocations: Object.entries(allocations)
          .filter(([, v]) => v > 0.001)
          .map(([key, amount]) => {
            const [source, id] = key.split(":");
            if (source === "ADVANCE") {
              return {
                billId: pickBillForAdvanceDraw(),
                amount,
                source: "ADVANCE" as const,
                sourcePaymentMadeId: id,
              };
            }
            return {
              billId: id,
              amount,
              source: "FRESH" as const,
              sourcePaymentMadeId: null,
            };
          }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy("idle");
    }
  }

  /**
   * When the user enters an amount in an ADVANCE row, we need to
   * attribute it to a Bill. v1 simplification: split it across the
   * fresh-allocated bills proportionally. If no fresh allocations
   * yet, attribute to the first open bill. The server-side already
   * supports source='ADVANCE' allocations pointing at any bill.
   *
   * Real users typically advance-draw against a specific bill, but
   * the spec UI doesn't ask them which one — it's just one row at
   * the top of the table. We pick the bill with the largest fresh
   * allocation OR the first open bill if no fresh allocations exist.
   */
  function pickBillForAdvanceDraw(): string {
    // Largest fresh allocation gets the advance drawdown attributed.
    const freshEntries = Object.entries(allocations).filter(([k]) =>
      k.startsWith("FRESH:")
    );
    if (freshEntries.length > 0) {
      const [bestKey] = freshEntries.reduce((best, cur) =>
        cur[1] > best[1] ? cur : best
      );
      return bestKey.split(":")[1];
    }
    return openBills[0]?.id ?? "";
  }

  async function submitVendorAdvance(status: "DRAFT" | "PAID") {
    if (!contactId) {
      toast.error("Pick a vendor");
      return;
    }
    const advanceNum = Number(advanceAmount) || 0;
    if (advanceNum <= 0) {
      toast.error("Enter an advance amount");
      return;
    }
    setBusy(status === "DRAFT" ? "draft" : "paid");
    try {
      await createVendorAdvanceAction({
        paymentType: "VENDOR_ADVANCE",
        contactId,
        paymentDate,
        amountPaid: advanceNum,
        paymentMode,
        paidThroughAccountId,
        depositToAccountId,
        tdsId,
        tdsAmount: Number(tdsAmount) || 0,
        reference: reference || null,
        notes: notes || null,
        attachments: [],
        status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy("idle");
    }
  }

  return (
    <div className="space-y-6">
      {/* ───── Tab switcher ───── */}
      <div className="grid grid-cols-2 rounded-md border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setTab("BILL_PAYMENT")}
          className={`py-3 text-sm font-medium transition-colors ${
            tab === "BILL_PAYMENT"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Bill Payment
        </button>
        <button
          type="button"
          onClick={() => setTab("VENDOR_ADVANCE")}
          className={`py-3 text-sm font-medium transition-colors ${
            tab === "VENDOR_ADVANCE"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Vendor Advance
        </button>
      </div>

      {/* ───── Shared vendor + date band ───── */}
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Vendor name *</Label>
        <Combobox
          options={vendorOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Select vendor…"
          testId="payment-vendor-combobox"
        />

        <Label className="pt-2">
          {tab === "BILL_PAYMENT" ? "Payment made *" : "Amount *"}
        </Label>
        <div className="flex items-center gap-3">
          <MoneyInput
            value={tab === "BILL_PAYMENT" ? paymentAmount : advanceAmount}
            onChange={
              tab === "BILL_PAYMENT" ? setPaymentAmount : setAdvanceAmount
            }
            currencyCode={currency}
            data-testid="payment-amount-input"
          />
          {tab === "BILL_PAYMENT" && advanceBalance.totalBalance > 0.001 ? (
            <span className="text-xs text-muted-foreground">
              Vendor advance available:{" "}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {formatMoney(advanceBalance.totalBalance, currency)}
              </strong>
            </span>
          ) : null}
        </div>

        <Label className="pt-2">Payment date *</Label>
        <DatePicker value={paymentDate} onChange={(d) => d && setPaymentDate(d)} />

        <Label className="pt-2">Payment mode</Label>
        <Combobox
          options={PAYMENT_MODES.map((m) => ({
            value: m,
            label: PAYMENT_MODE_LABELS[m],
          }))}
          value={paymentMode}
          onChange={(v) =>
            setPaymentMode((v ?? "cash") as (typeof PAYMENT_MODES)[number])
          }
        />

        <Label className="pt-2">Paid through *</Label>
        <Combobox
          options={accountOptions}
          value={paidThroughAccountId}
          onChange={setPaidThroughAccountId}
          placeholder={
            accountOptions.length === 0
              ? "No accounts configured"
              : "Pick a cash/bank account"
          }
        />

        {tab === "VENDOR_ADVANCE" ? (
          <>
            <Label className="pt-2">Deposit to</Label>
            <Combobox
              options={accountOptions}
              value={depositToAccountId}
              onChange={setDepositToAccountId}
              placeholder="Prepaid Expenses (default)"
            />

            <Label className="pt-2">TDS</Label>
            <div className="flex items-center gap-2">
              <Combobox
                options={tdsOptions}
                value={tdsId}
                onChange={setTdsId}
                placeholder={
                  tdsOptions.length === 0
                    ? "No TDS taxes configured"
                    : "Optional"
                }
              />
              {tdsId ? (
                <div className="w-32">
                  <MoneyInput
                    value={tdsAmount}
                    onChange={setTdsAmount}
                    currencyCode={currency}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        <Label className="pt-2">Reference #</Label>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Optional"
        />
      </section>

      {/* ───── Partner-bank promo ───── */}
      <PartnerBankPromo />

      {/* ───── BILL PAYMENT — allocation table ───── */}
      {tab === "BILL_PAYMENT" ? (
        <section className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              Apply to bills{" "}
              {contactId ? `(${openBills.length} open)` : ""}
            </h3>
            {Object.keys(allocations).length > 0 ? (
              <button
                type="button"
                onClick={clearAllocations}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Eraser className="h-3 w-3" /> Clear applied
              </button>
            ) : null}
          </div>

          {!contactId ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              Pick a vendor to see their open bills.
            </div>
          ) : loadingBills ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              Loading…
            </div>
          ) : openBills.length === 0 &&
            advanceBalance.advances.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              There are no bills for this vendor.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Bill #</th>
                  <th className="p-3">PO #</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Due</th>
                  <th className="p-3 text-right">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Advance drawdown rows */}
                {advanceBalance.advances.map((adv) => {
                  const key = `ADVANCE:${adv.paymentMadeId}`;
                  const value = allocations[key] ?? 0;
                  return (
                    <tr
                      key={key}
                      className="bg-emerald-50/40 dark:bg-emerald-950/20"
                    >
                      <td className="p-3 text-xs text-muted-foreground">
                        {format(adv.paymentDate, "dd MMM yyyy")}
                      </td>
                      <td className="p-3" colSpan={2}>
                        <div className="font-medium text-emerald-700 dark:text-emerald-400">
                          Use Vendor Advance{" "}
                          <span className="font-mono text-xs">
                            {adv.number}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Drawdown — no fresh cash leaves your account
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatMoney(adv.originalAmount, currency)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(adv.remaining, currency)}
                      </td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={adv.remaining}
                          className="w-32 ml-auto text-right"
                          value={value || ""}
                          onChange={(e) => {
                            const n = Math.min(
                              Number(e.target.value),
                              adv.remaining
                            );
                            setAlloc(key, n);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}

                {/* Fresh-cash bill rows */}
                {openBills.map((b) => {
                  const key = `FRESH:${b.id}`;
                  const value = allocations[key] ?? 0;
                  return (
                    <tr key={key}>
                      <td className="p-3 text-xs">
                        {format(b.issueDate, "dd MMM yyyy")}
                      </td>
                      <td className="p-3 font-mono">{b.number}</td>
                      <td className="p-3 text-xs font-mono">
                        {b.purchaseOrderNumber ?? "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(b.total, currency)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMoney(b.amountDue, currency)}
                      </td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={b.amountDue}
                          className="w-32 ml-auto text-right"
                          value={value || ""}
                          onChange={(e) => {
                            const n = Math.min(
                              Number(e.target.value),
                              b.amountDue
                            );
                            setAlloc(key, n);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {/* ───── Summary card (Bill Payment only) ───── */}
      {tab === "BILL_PAYMENT" ? (
        <section className="rounded-md border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span>Amount Paid</span>
            <span className="tabular-nums font-medium">
              {formatMoney(paymentMadeNum, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Amount used for Payments</span>
            <span className="tabular-nums">
              {formatMoney(amountForBills, currency)}
            </span>
          </div>
          {amountInExcess > 0.001 ? (
            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-medium pt-1 border-t border-amber-200">
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Amount in Excess
              </span>
              <span className="tabular-nums">
                {formatMoney(amountInExcess, currency)}
              </span>
            </div>
          ) : null}
          {amountInExcess > 0.001 ? (
            <p className="text-xs text-muted-foreground">
              The excess will be recorded as a separate vendor advance
              for future bill payments.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ───── Notes (both tabs) ───── */}
      <section>
        <Label htmlFor="notes" className="mb-2 block">
          Notes <span className="text-xs text-muted-foreground">(Internal use — not visible to vendor)</span>
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {/* ───── Sticky action bar ───── */}
      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button
          type="button"
          onClick={() =>
            tab === "BILL_PAYMENT"
              ? submitBillPayment("DRAFT")
              : submitVendorAdvance("DRAFT")
          }
          disabled={busy !== "idle"}
          variant="outline"
          className="gap-1"
        >
          {busy === "draft" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Save as Draft
        </Button>
        <Button
          type="button"
          onClick={() =>
            tab === "BILL_PAYMENT"
              ? submitBillPayment("PAID")
              : submitVendorAdvance("PAID")
          }
          disabled={busy !== "idle"}
          className="gap-1"
          data-testid="payment-save-as-paid-button"
        >
          {busy === "paid" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Save as Paid
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/purchases/payments-made")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
