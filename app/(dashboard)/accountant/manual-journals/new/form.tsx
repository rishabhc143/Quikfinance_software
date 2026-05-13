"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  createManualJournalAndRedirectAction,
  type ManualJournalInput,
} from "../actions";

type Account = { id: string; name: string; code: string | null; type: string };
type Line = {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
};

type ReportingMethod = "ACCRUAL_AND_CASH" | "ACCRUAL_ONLY" | "CASH_ONLY";

/**
 * ACCT-A.2 — Manual Journal create form with Zoho-parity header.
 *
 * Header fields:
 *   - Date *
 *   - Reverse Journal Date (optional) + publish-only-on-date checkbox
 *   - Reference#
 *   - Notes *
 *   - Reporting Method (Accrual and Cash / Accrual Only / Cash Only)
 *   - Currency (defaults to org currency)
 *
 * Lines: balanced DR/CR table with live totals + "Balanced ✓" indicator.
 * Submit posts the JE + (optional) reverse JE atomically server-side.
 *
 * Save as Draft is intentionally NOT here (lands in ACCT-A.3 with
 * proper line storage).
 */
export function ManualJournalForm({
  accounts,
  currency: orgCurrency,
  defaultDate,
}: {
  accounts: Account[];
  currency: string;
  defaultDate: string;
}) {
  const router = useRouter();

  // Header state
  const [date, setDate] = React.useState(defaultDate);
  const [reverseDate, setReverseDate] = React.useState("");
  const [publishReverseOnlyOnDate, setPublishReverseOnlyOnDate] =
    React.useState(false);
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [reportingMethod, setReportingMethod] =
    React.useState<ReportingMethod>("ACCRUAL_AND_CASH");
  const [currency, setCurrency] = React.useState(orgCurrency);

  // Lines state
  const [lines, setLines] = React.useState<Line[]>([
    { accountId: "", debit: 0, credit: 0, description: "" },
    { accountId: "", debit: 0, credit: 0, description: "" },
  ]);
  const [busy, setBusy] = React.useState(false);

  const totalDebit = lines.reduce(
    (s, l) => s + (Number.isFinite(l.debit) ? l.debit : 0),
    0
  );
  const totalCredit = lines.reduce(
    (s, l) => s + (Number.isFinite(l.credit) ? l.credit : 0),
    0
  );
  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 0.001 && totalDebit > 0;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((s) => [
      ...s,
      { accountId: "", debit: 0, credit: 0, description: "" },
    ]);
  }
  function removeLine(i: number) {
    if (lines.length > 2) setLines((s) => s.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!balanced) {
      toast.error("Debits and credits must balance and total > 0");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pick an account on every line");
      return;
    }
    setBusy(true);
    try {
      const input: ManualJournalInput = {
        date: new Date(date),
        notes: notes || null,
        referenceNumber: referenceNumber.trim() || null,
        reportingMethod,
        currency: currency.trim().toUpperCase() || null,
        reverseJournalDate: reverseDate ? new Date(reverseDate) : null,
        publishReverseOnlyOnDate,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
        })),
      };
      await createManualJournalAndRedirectAction(input);
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
          {/* Date + Reverse Journal Date */}
          <div className="grid gap-3 md:grid-cols-2">
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
              <Label>Reverse Journal Date</Label>
              <Input
                type="date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
                min={date}
                placeholder="dd/MM/yyyy"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={publishReverseOnlyOnDate}
                  onChange={(e) => setPublishReverseOnlyOnDate(e.target.checked)}
                />
                Publish reverse journal only on the reverse journal date
                <span title="For v1 the reverse JE is always date-stamped to the reverse date. This checkbox is stored for round-trip fidelity with Zoho exports but has no effect on math.">
                  <Info className="h-3 w-3" />
                </span>
              </label>
            </div>
          </div>

          {/* Reference# + Notes */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Reference#</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                maxLength={120}
                placeholder="External doc id / memo"
              />
            </div>
            <div>
              <Label>
                Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Max 500 characters"
                maxLength={500}
                required
              />
            </div>
          </div>

          {/* Reporting Method + Currency */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>
                Reporting Method
                <span
                  className="ml-1 inline-flex"
                  title="Stored on the journal. Cash-basis reports (coming soon) will use this; the current accrual P&L + Trial Balance ignore it."
                >
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </Label>
              <div className="flex gap-3 mt-1.5">
                {(
                  [
                    ["ACCRUAL_AND_CASH", "Accrual and Cash"],
                    ["ACCRUAL_ONLY", "Accrual Only"],
                    ["CASH_ONLY", "Cash Only"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="inline-flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reportingMethod"
                      value={value}
                      checked={reportingMethod === value}
                      onChange={() => setReportingMethod(value)}
                      className="h-4 w-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value.toUpperCase().slice(0, 3))
                }
                maxLength={3}
                placeholder="INR"
                className="md:max-w-[150px] uppercase tracking-wider"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Three-letter ISO code. Defaults to your org currency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-left p-3">Description</th>
                <th className="text-right p-3 w-32">Debit</th>
                <th className="text-right p-3 w-32">Credit</th>
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
                          {a.name} ({a.type.toLowerCase().replace("_", " ")})
                        </option>
                      ))}
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
                      value={l.debit || ""}
                      onChange={(e) =>
                        setLine(i, { debit: Number(e.target.value), credit: 0 })
                      }
                      className="h-9 text-right"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.credit || ""}
                      onChange={(e) =>
                        setLine(i, { credit: Number(e.target.value), debit: 0 })
                      }
                      className="h-9 text-right"
                    />
                  </td>
                  <td className="p-2">
                    {lines.length > 2 && (
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
                <td colSpan={2} className="p-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                  </Button>
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {formatMoney(totalDebit, currency || orgCurrency)}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {formatMoney(totalCredit, currency || orgCurrency)}
                </td>
                <td />
              </tr>
              <tr>
                <td
                  colSpan={2}
                  className={
                    "p-3 text-right text-xs " +
                    (balanced ? "text-emerald-600" : "text-destructive")
                  }
                >
                  {balanced
                    ? "Balanced ✓"
                    : `Off by ${formatMoney(Math.abs(diff), currency || orgCurrency)}`}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/accountant/manual-journals")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !balanced}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save and Publish
        </Button>
      </div>
    </form>
  );
}
