"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
type Line = { accountId: string; debit: number; credit: number; description: string };

/**
 * ACCT-A — Manual Journal create form. Mirrors the JournalEntryForm
 * shape but no user-facing Reference field — we auto-set the JE's
 * reference to `MJ:<headerId>` on the server.
 */
export function ManualJournalForm({
  accounts,
  currency,
  defaultDate,
}: {
  accounts: Account[];
  currency: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [date, setDate] = React.useState(defaultDate);
  const [notes, setNotes] = React.useState("");
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
      <div>
        <Label>
          Date <span className="text-destructive">*</span>
        </Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="md:max-w-xs"
        />
      </div>

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
                      onChange={(e) => setLine(i, { description: e.target.value })}
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
                  {formatMoney(totalDebit, currency)}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {formatMoney(totalCredit, currency)}
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
                    : `Off by ${formatMoney(Math.abs(diff), currency)}`}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <div>
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's this adjustment for?"
        />
      </div>

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
          Post manual journal
        </Button>
      </div>
    </form>
  );
}
