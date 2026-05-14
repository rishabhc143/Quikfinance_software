"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  createBudgetAndRedirectAction,
  type BudgetInput,
} from "../actions";

type PnLAccount = {
  id: string;
  name: string;
  code: string | null;
  type: string;
};

type Line = {
  accountId: string;
  annualAmount: number;
};

/**
 * ACCT-D — Create-Budget form. One annual value per account; the
 * server distributes it evenly across 12 month buckets. A future
 * ACCT-D.2 will add per-month edit, so this form keeps the
 * "one annual cell per account" shape intentionally simple.
 */
export function BudgetForm({
  accounts,
  currency,
  defaultFiscalYear,
}: {
  accounts: PnLAccount[];
  currency: string;
  defaultFiscalYear: number;
}) {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [fiscalYear, setFiscalYear] = React.useState<number>(defaultFiscalYear);
  const [lines, setLines] = React.useState<Line[]>([
    { accountId: "", annualAmount: 0 },
  ]);
  const [busy, setBusy] = React.useState(false);

  const totalAnnual = lines.reduce(
    (s, l) =>
      s + (Number.isFinite(l.annualAmount) ? l.annualAmount : 0),
    0
  );

  function setLine(i: number, patch: Partial<Line>) {
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((s) => [...s, { accountId: "", annualAmount: 0 }]);
  }
  function removeLine(i: number) {
    if (lines.length > 1) setLines((s) => s.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name the budget");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pick an account on every line");
      return;
    }
    const picked = new Set(lines.map((l) => l.accountId));
    if (picked.size !== lines.length) {
      toast.error("Each account can only appear once");
      return;
    }
    setBusy(true);
    try {
      const input: BudgetInput = {
        name: name.trim(),
        fiscalYear,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          annualAmount: l.annualAmount,
        })),
      };
      await createBudgetAndRedirectAction(input);
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
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. FY26 Operating Plan"
                maxLength={160}
                required
              />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Fiscal year <span className="text-destructive">*</span>
                <span title="The year number; the month-1 of the budget follows your org's fiscal-year start (set in Settings).">
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={fiscalYear}
                onChange={(e) =>
                  setFiscalYear(Number(e.target.value) || defaultFiscalYear)
                }
                required
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Accounts
            <span className="text-xs text-muted-foreground font-normal ml-2">
              Annual amount auto-distributes evenly across the 12 months.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-right p-3 w-44">Annual amount</th>
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
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.annualAmount || ""}
                      onChange={(e) =>
                        setLine(i, { annualAmount: Number(e.target.value) })
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
                <td className="p-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add account
                  </Button>
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  Total {formatMoney(totalAnnual, currency)}
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
          onClick={() => router.push("/accountant/budgets")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Budget
        </Button>
      </div>
    </form>
  );
}
