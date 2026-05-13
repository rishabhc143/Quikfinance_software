"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import { initiateAndRedirectAction } from "../actions";

/**
 * BNK-F — Initiate form. Captures start/end dates + a closing balance.
 * Opening balance is precomputed by the server (last reconciliation's
 * closing, or `BankAccount.openingBalance` if first), and the user can
 * override it inline.
 */
export function InitiateForm({
  bankAccountId,
  currency,
  suggestedOpeningBalance,
  suggestedOpeningSource,
}: {
  bankAccountId: string;
  currency: string;
  suggestedOpeningBalance: number;
  /** Human label for where the opening came from — e.g.
   *  "Last reconciliation (05 Mar 2026)" or "Account opening balance". */
  suggestedOpeningSource: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState(today);
  const [openingBalance, setOpeningBalance] = React.useState(
    String(suggestedOpeningBalance)
  );
  const [openingOverridden, setOpeningOverridden] = React.useState(false);
  const [closingBalance, setClosingBalance] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function validate(): string | null {
    if (!startDate) return "Pick a start date.";
    if (!endDate) return "Pick an end date.";
    if (new Date(endDate) < new Date(startDate))
      return "End date must be on or after start date.";
    if (closingBalance.trim() === "")
      return "Enter the closing balance from your bank statement.";
    if (!Number.isFinite(Number(closingBalance)))
      return "Closing balance must be a number.";
    if (!Number.isFinite(Number(openingBalance)))
      return "Opening balance must be a number.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      await initiateAndRedirectAction({
        bankAccountId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        openingBalance: Number(openingBalance),
        closingBalance: Number(closingBalance),
        notes: notes.trim() || null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start reconciliation";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">
                Start date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">
                End date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Opening balance</Label>
            {!openingOverridden ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <div>
                  <div className="font-medium tabular-nums">
                    {formatMoney(suggestedOpeningBalance, currency)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {suggestedOpeningSource}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpeningOverridden(true)}
                >
                  Override
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpeningBalance(String(suggestedOpeningBalance));
                    setOpeningOverridden(false);
                  }}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">
              Closing balance from bank statement{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="e.g. 62150.00"
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The balance your bank says you have at the end of the period.
              We&apos;ll tick transactions until the difference is zero.
            </p>
          </div>

          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Memo for this reconciliation"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 mt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/banking/accounts/${bankAccountId}`)}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="gap-1">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Start Reconciliation
        </Button>
      </div>
    </form>
  );
}
