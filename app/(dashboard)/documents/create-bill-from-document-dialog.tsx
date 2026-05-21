"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt as ReceiptIcon } from "lucide-react";
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
  createBillFromDocumentAction,
  searchVendorsForDocAction,
} from "./actions";
import type { ParsedBill } from "@/lib/documents/parsers";

/**
 * DOC-D2.3: "Create Bill" modal triggered from the preview drawer
 * for parsed bill / invoice documents. Prefills from the
 * ParsedBill structure, lets the user pick the matching vendor
 * (autocomplete on displayName + GSTIN), then creates a DRAFT Bill
 * and redirects to its edit page so the user can finalise line
 * items + taxes.
 */
export function CreateBillFromDocumentDialog({
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
  parsed: ParsedBill;
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
  const [billNumber, setBillNumber] = React.useState(parsed.billNumber ?? "");
  const [issueDate, setIssueDate] = React.useState(
    parsed.issueDate ?? new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = React.useState(
    parsed.dueDate ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
  );
  const [total, setTotal] = React.useState<string>(
    parsed.total != null ? String(parsed.total) : ""
  );
  const [submitting, setSubmitting] = React.useState(false);

  // Run vendor search on initial open (using the parsed vendor name
  // as query) so the picker is pre-populated.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    searchVendorsForDocAction(vendorQuery)
      .then((rows) => {
        if (cancelled) return;
        setVendorMatches(rows);
        // Auto-pick when there's exactly one match — saves a click.
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
    if (!vendorId) {
      toast.error("Pick a vendor.");
      return;
    }
    const totalNum = Number(total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      toast.error("Total must be a positive number.");
      return;
    }
    setSubmitting(true);
    const result = await createBillFromDocumentAction({
      documentId,
      vendorId,
      billNumber: billNumber || undefined,
      issueDate,
      dueDate,
      total: totalNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Bill created — opening to fine-tune line items + taxes…");
    onOpenChange(false);
    router.push(`/purchases/bills/${result.billId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIcon className="h-5 w-5 text-primary" />
            Create Bill
          </DialogTitle>
          <DialogDescription>
            Prefilled from &ldquo;{documentName}&rdquo;. Pick the vendor,
            confirm the fields, then we&apos;ll open the bill for line
            items + taxes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="vendor-search">
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vendor-search"
              value={vendorQuery}
              onChange={(e) => void onSearch(e.target.value)}
              placeholder="Search by name or GSTIN…"
            />
            {searching ? (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> searching…
              </p>
            ) : vendorMatches.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                No vendors match.{" "}
                <a
                  href="/purchases/vendors/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Add a vendor
                </a>{" "}
                in a new tab, then come back.
              </p>
            ) : (
              <div className="mt-1 max-h-32 overflow-y-auto border rounded-md bg-background">
                {vendorMatches.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVendorId(v.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm hover:bg-muted/60 ${
                      vendorId === v.id ? "bg-primary/10 text-primary" : ""
                    }`}
                  >
                    <div className="font-medium">{v.label}</div>
                    {v.gstin ? (
                      <div className="text-xs text-muted-foreground">
                        GSTIN: {v.gstin}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
            {parsed.gstin ? (
              <p className="text-xs text-muted-foreground mt-1">
                Extracted GSTIN: {parsed.gstin}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bill-number">Bill #</Label>
              <Input
                id="bill-number"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="auto-generated if blank"
              />
            </div>
            <div>
              <Label htmlFor="total">
                Total <span className="text-destructive">*</span>
              </Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="issue-date">Issue date</Label>
              <Input
                id="issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="due-date">Due date</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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
              disabled={submitting || !vendorId || !total}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Creating…
                </>
              ) : (
                "Create Bill"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
