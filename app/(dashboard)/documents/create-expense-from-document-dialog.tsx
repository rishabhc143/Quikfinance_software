"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createExpenseFromDocumentAction,
  searchVendorsForDocAction,
} from "./actions-ar-ap";
import type { ParsedReceipt } from "@/lib/documents/parsers";

/**
 * DOC-D2.3: "Create Expense" modal triggered from the preview drawer
 * for parsed receipt documents. Lighter than the Bill dialog — Expense
 * is a single-line record. User picks a vendor (optional), category
 * (free text), date, and amount.
 */
export function CreateExpenseFromDocumentDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  parsed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  documentName: string;
  parsed: ParsedReceipt;
}) {
  const router = useRouter();

  const [vendorQuery, setVendorQuery] = React.useState(
    parsed.vendorName ?? ""
  );
  const [vendorId, setVendorId] = React.useState<string>("");
  const [vendorMatches, setVendorMatches] = React.useState<
    Array<{ id: string; label: string; gstin: string | null }>
  >([]);
  const [searching, setSearching] = React.useState(false);
  const [category, setCategory] = React.useState<string>("Other Expenses");
  const [date, setDate] = React.useState(
    parsed.date ?? new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = React.useState<string>(
    parsed.total != null ? String(parsed.total) : ""
  );
  const [reference, setReference] = React.useState<string>(
    parsed.paidVia ?? ""
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    searchVendorsForDocAction(vendorQuery)
      .then((rows) => {
        if (cancelled) return;
        setVendorMatches(rows);
        if (rows.length === 1) setVendorId(rows[0].id);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSearch(q: string) {
    setVendorQuery(q);
    setSearching(true);
    const rows = await searchVendorsForDocAction(q);
    setVendorMatches(rows);
    setSearching(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Amount must be a positive number.");
      return;
    }
    if (!category.trim()) {
      toast.error("Pick a category.");
      return;
    }
    setSubmitting(true);
    const result = await createExpenseFromDocumentAction({
      documentId,
      vendorId: vendorId || undefined,
      category: category.trim(),
      date,
      amount: amountNum,
      reference: reference || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Expense created — opening to review…");
    onOpenChange(false);
    router.push(`/purchases/expenses/${result.expenseId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Create Expense
          </DialogTitle>
          <DialogDescription>
            Prefilled from &ldquo;{documentName}&rdquo;. Optional vendor;
            category + amount are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="vendor-search">Vendor (optional)</Label>
            <Input
              id="vendor-search"
              value={vendorQuery}
              onChange={(e) => void onSearch(e.target.value)}
              placeholder="Search by name…"
            />
            {searching ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> searching…
              </p>
            ) : vendorMatches.length > 0 ? (
              <div className="mt-1 max-h-28 overflow-y-auto border rounded-md bg-background">
                {vendorMatches.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVendorId(v.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted/60 ${
                      vendorId === v.id ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setVendorId("")}
                  className={`w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 ${
                    !vendorId ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  — no vendor —
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Travel, Meals, Office Supplies…"
                required
              />
            </div>
            <div>
              <Label htmlFor="amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="UPI, Card, Cash…"
              />
            </div>
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
              disabled={submitting || !amount || !category}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Creating…
                </>
              ) : (
                "Create Expense"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
