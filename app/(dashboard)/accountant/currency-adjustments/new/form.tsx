"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  createCurrencyAdjustmentAndRedirectAction,
  type CurrencyAdjustmentInput,
} from "../actions";

type Account = { id: string; name: string; code: string | null; type: string };

type Line = {
  accountId: string;
  kind: "GAIN" | "LOSS";
  amount: number;
  description: string;
};

/**
 * ACCT-C — Currency Adjustment create form.
 *
 * v1 is manual entry: the accountant computes their FC exposure
 * externally and enters one line per affected account with the
 * gain or loss amount in **org-default currency**. Each line
 * auto-balances against SYS-FX-GAIN or SYS-FX-LOSS at post time.
 */
export function CurrencyAdjustmentForm({
  accounts,
  currency: orgCurrency,
  defaultDate,
}: {
  accounts: Account[];
  currency: string;
  defaultDate: string;
}) {
  const router = useRouter();

  const [date, setDate] = React.useState(defaultDate);
  const [currency, setCurrency] = React.useState("USD");
  const [exchangeRate, setExchangeRate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([
    { accountId: "", kind: "GAIN", amount: 0, description: "" },
  ]);
  const [busy, setBusy] = React.useState(false);

  const totalGain = lines.reduce(
    (s, l) => s + (l.kind === "GAIN" && Number.isFinite(l.amount) ? l.amount : 0),
    0
  );
  const totalLoss = lines.reduce(
    (s, l) => s + (l.kind === "LOSS" && Number.isFinite(l.amount) ? l.amount : 0),
    0
  );
  const net = totalGain - totalLoss;

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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>
                Currency <span className="text-destructive">*</span>
              </Label>
              <Input
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value.toUpperCase().slice(0, 3))
                }
                maxLength={3}
                placeholder="USD"
                className="uppercase tracking-wider"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                The foreign currency being revalued.
              </p>
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Exchange rate
                <span title="Optional. Stored on the header for audit context; the ledger posts absolute gain/loss amounts in your org-default currency.">
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </Label>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder="e.g. 84.25"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why are you running this adjustment? (Max 500 chars)"
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Adjustment lines
            <span className="text-xs text-muted-foreground font-normal ml-2">
              GAIN debits the account &amp; credits FX Gain · LOSS does the
              opposite.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-left p-3 w-32">Kind</th>
                <th className="text-left p-3">Description</th>
                <th className="text-right p-3 w-36">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-2">
                    <select
                      value={l.accountId}
                      onChange={(e) => setLine(i, { accountId: e.target.value })}
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
            <tfoot className="bg-muted/20 text-sm">
              <tr>
                <td colSpan={3} className="p-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                  </Button>
                </td>
                <td className="p-3 text-right tabular-nums">
                  <div className="text-xs text-emerald-600">
                    Gain {formatMoney(totalGain, orgCurrency)}
                  </div>
                  <div className="text-xs text-destructive">
                    Loss {formatMoney(totalLoss, orgCurrency)}
                  </div>
                  <div
                    className={
                      "font-semibold " +
                      (net >= 0 ? "text-emerald-600" : "text-destructive")
                    }
                  >
                    Net {formatMoney(Math.abs(net), orgCurrency)}
                    {net >= 0 ? " gain" : " loss"}
                  </div>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/accountant/currency-adjustments")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || lines.length === 0}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Post Adjustment
        </Button>
      </div>
    </form>
  );
}
