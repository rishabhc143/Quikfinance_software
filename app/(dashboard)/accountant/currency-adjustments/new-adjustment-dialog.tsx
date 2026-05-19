"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { ISO_CURRENCIES } from "@/lib/accounting/currencies";
import {
  createCurrencyAdjustmentAndRedirectAction,
  type CurrencyAdjustmentInput,
} from "./actions";

type Account = { id: string; name: string; code: string | null; type: string };

type Line = {
  accountId: string;
  kind: "GAIN" | "LOSS";
  amount: number;
  description: string;
};

/**
 * ACCT-C.3 — Base Currency Adjustment modal matching the reference UX.
 *
 * Two steps inside one modal:
 *   ① Configure — Currency / Date / Exchange Rate / Notes
 *      (matches the reference screenshot 1:1; the user enters the rate
 *      they're revaluing FC balances at)
 *   ② Allocate  — per-account gain/loss lines. This step exists
 *      because we don't track per-line FC amounts in the ledger
 *      yet, so we can't auto-compute the gain/loss per account
 *      from the new rate. Accountant enters the impact manually
 *      and we post the balanced JE.
 *
 * Step 1 → Continue → Step 2 → Post Adjustment.
 */
export function NewBaseCurrencyAdjustmentDialog({
  open,
  onOpenChange,
  accounts,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Org's base currency. The rate is expressed as 1 FC = X BASE. */
  baseCurrency: string;
}) {
  const router = useRouter();

  const [step, setStep] = React.useState<1 | 2>(1);
  const [currency, setCurrency] = React.useState("AED");
  const [date, setDate] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [exchangeRate, setExchangeRate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([
    { accountId: "", kind: "GAIN", amount: 0, description: "" },
  ]);
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setStep(1);
    setCurrency("AED");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setExchangeRate("");
    setNotes("");
    setLines([{ accountId: "", kind: "GAIN", amount: 0, description: "" }]);
  }

  React.useEffect(() => {
    if (!open) reset();
  }, [open]);

  function goToStep2() {
    if (!currency.trim()) {
      toast.error("Pick a currency");
      return;
    }
    if (!exchangeRate || Number(exchangeRate) <= 0) {
      toast.error("Enter a positive exchange rate");
      return;
    }
    if (!notes.trim()) {
      toast.error("Add a note describing the adjustment");
      return;
    }
    setStep(2);
  }

  // Step-2 line helpers
  function setLine(i: number, patch: Partial<Line>) {
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((s) => [
      ...s,
      { accountId: "", kind: "GAIN", amount: 0, description: "" },
    ]);
  }
  function removeLine(i: number) {
    if (lines.length > 1) setLines((s) => s.filter((_, idx) => idx !== i));
  }

  const totalGain = lines.reduce(
    (s, l) => s + (l.kind === "GAIN" && Number.isFinite(l.amount) ? l.amount : 0),
    0
  );
  const totalLoss = lines.reduce(
    (s, l) => s + (l.kind === "LOSS" && Number.isFinite(l.amount) ? l.amount : 0),
    0
  );
  const net = totalGain - totalLoss;

  async function submit() {
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pick an account on every line");
      return;
    }
    if (lines.some((l) => !(l.amount > 0))) {
      toast.error("Every line needs a positive amount");
      return;
    }
    setBusy(true);
    try {
      const input: CurrencyAdjustmentInput = {
        date: new Date(date),
        currency: currency.trim().toUpperCase(),
        exchangeRate: exchangeRate ? Number(exchangeRate) : null,
        notes: notes || null,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          kind: l.kind,
          amount: l.amount,
          description: l.description || null,
        })),
      };
      await createCurrencyAdjustmentAndRedirectAction(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) {
        // Redirect threw — that's success
        onOpenChange(false);
        router.refresh();
        return;
      }
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          (step === 1 ? "max-w-lg" : "max-w-3xl") + " p-0 gap-0"
        }
      >
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-base font-semibold">
            Base Currency Adjustment
          </DialogTitle>
          {/* Note: <DialogContent> already renders its own X close
              button in the top-right (components/ui/dialog.tsx). We
              don't add another one here — doing so caused two
              overlapping close marks (PR #150-followup). */}
        </DialogHeader>

        {step === 1 ? (
          <div className="p-6 space-y-4">
            <div>
              <Label className="text-destructive">
                Currency<span aria-hidden>*</span>
              </Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {ISO_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-destructive">
                Date of Adjustment<span aria-hidden>*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label className="text-destructive">
                Exchange Rate<span aria-hidden>*</span>
              </Label>
              <div className="flex items-stretch">
                <div className="flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted/40 text-sm font-medium">
                  1 {currency} =
                </div>
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  placeholder="e.g. 26.074939"
                  className="rounded-none border-x-0 flex-1"
                  required
                />
                <div className="flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted/40 text-sm font-medium">
                  {baseCurrency}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-destructive">
                Notes<span aria-hidden>*</span>
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Max. 500 characters"
                maxLength={500}
                rows={4}
                required
              />
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="rounded-md bg-muted/30 border p-3 text-sm flex items-center gap-4 flex-wrap">
              <Info className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="font-medium">{currency}</span>{" "}
                <span className="text-muted-foreground">·</span>{" "}
                <span>1 {currency} = {exchangeRate} {baseCurrency}</span>{" "}
                <span className="text-muted-foreground">·</span>{" "}
                <span>{format(new Date(date), "dd MMM yyyy")}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="ml-auto"
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Allocate the gain or loss to each affected account.
              GAIN debits the account and credits FX Gain; LOSS does
              the opposite.
            </p>

            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Account</th>
                  <th className="text-left p-2 w-28">Kind</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2 w-32">Amount</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-2">
                      <select
                        value={l.accountId}
                        onChange={(e) =>
                          setLine(i, { accountId: e.target.value })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        required
                      >
                        <option value="">Select…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code ? `${a.code} · ` : ""}
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={l.kind}
                        onChange={(e) =>
                          setLine(i, {
                            kind: e.target.value as "GAIN" | "LOSS",
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="GAIN">Gain</option>
                        <option value="LOSS">Loss</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <Input
                        value={l.description}
                        onChange={(e) =>
                          setLine(i, { description: e.target.value })
                        }
                        className="h-9"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.amount || ""}
                        onChange={(e) =>
                          setLine(i, { amount: Number(e.target.value) })
                        }
                        className="h-9 text-right"
                      />
                    </td>
                    <td className="p-2">
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="p-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addLine}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                    </Button>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    <div className="text-xs text-emerald-600">
                      Gain {formatMoney(totalGain, baseCurrency)}
                    </div>
                    <div className="text-xs text-destructive">
                      Loss {formatMoney(totalLoss, baseCurrency)}
                    </div>
                    <div
                      className={
                        "font-semibold " +
                        (net >= 0 ? "text-emerald-600" : "text-destructive")
                      }
                    >
                      Net {formatMoney(Math.abs(net), baseCurrency)}
                      {net >= 0 ? " gain" : " loss"}
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex justify-start gap-2 p-4 border-t bg-muted/20">
          {step === 1 ? (
            <Button type="button" onClick={goToStep2}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Post Adjustment
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
