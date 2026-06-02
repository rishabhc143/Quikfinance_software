"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { importStatementToBankAction } from "./actions-ar-ap";

/**
 * DOC-D2.2: "Import to Bank" modal triggered from the preview drawer
 * on a parsed bank statement. Pre-loaded bank account list comes from
 * the caller (the drawer fetches it on open).
 *
 * On confirm:
 *   - Calls `importStatementToBankAction(documentId, bankAccountId)`
 *   - Surfaces imported / skipped counts via toast
 *   - Refreshes the page (so the Bank Statements inbox + Trash counts
 *     stay current) and closes
 */
export function ImportToBankDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  rowCount,
  bankAccounts,
  accountNumberHint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  documentName: string;
  rowCount: number;
  bankAccounts: Array<{ id: string; label: string; last4?: string | null }>;
  /** DOC-D4.2: When the parsed statement carries an account number,
   *  the dialog uses its last 4 digits to auto-pick the matching
   *  BankAccount on open — saves a click and prevents importing into
   *  the wrong account. */
  accountNumberHint?: string | null;
}) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      // DOC-D4.2: If we have a hint (statement's accountNumber),
      // try to match by last 4 digits. Falls through to first account.
      let pick: string | undefined;
      if (accountNumberHint && accountNumberHint.length >= 4) {
        const last4 = accountNumberHint.slice(-4);
        const match = bankAccounts.find((a) => a.last4 === last4);
        if (match) pick = match.id;
      }
      setBankAccountId(pick ?? bankAccounts[0]?.id ?? "");
      setSubmitting(false);
    }
  }, [open, bankAccounts, accountNumberHint]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankAccountId) {
      toast.error("Choose a bank account first.");
      return;
    }
    setSubmitting(true);
    const result = await importStatementToBankAction({
      documentId,
      bankAccountId,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Imported ${result.imported} transaction${
        result.imported === 1 ? "" : "s"
      }${result.skipped > 0 ? `, skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}` : ""}.`
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Import to Bank
          </DialogTitle>
          <DialogDescription>
            Create {rowCount} bank transaction{rowCount === 1 ? "" : "s"}{" "}
            from &ldquo;{documentName}&rdquo;. Duplicates (same date,
            amount, description) are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="bank-account">
              Bank account <span className="text-destructive">*</span>
            </Label>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">
                No bank accounts yet.{" "}
                <a
                  href="/banking/accounts/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Add one
                </a>{" "}
                first.
              </p>
            ) : (
              <select
                id="bank-account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting || bankAccounts.length === 0 || !bankAccountId
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Importing…
                </>
              ) : (
                "Import to Bank"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
