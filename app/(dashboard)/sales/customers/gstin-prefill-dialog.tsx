"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type GstPrefillData = {
  gstin: string;
  legalName: string;
  tradeName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  gstTreatment: string;
  placeOfSupply: string;
};

/**
 * GSTIN prefill modal per <customers_spec>:
 *   "Prefill Customer details from the GST portal using the Customer's
 *    GSTIN. Prefill ›  — clickable opens a modal with GSTIN input →
 *    validates 15-char pattern → calls a stub /api/gst/lookup route
 *    (returns mock data in dev) → populates name/address."
 *
 * The caller passes onApply which receives the fields the merchant
 * checked off. The dialog handles validation, fetch, and review of the
 * data before the apply.
 */
export function GstinPrefillDialog({
  initialGstin,
  onApply,
}: {
  initialGstin?: string;
  onApply: (data: GstPrefillData) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [gstin, setGstin] = React.useState(initialGstin ?? "");
  const [busy, setBusy] = React.useState(false);
  const [data, setData] = React.useState<GstPrefillData | null>(null);

  async function lookup() {
    const g = gstin.trim().toUpperCase();
    if (!GSTIN_REGEX.test(g)) {
      toast.error("GSTIN must match 15-char pattern: e.g. 22AAAAA0000A1Z5");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/gst/lookup?gstin=${encodeURIComponent(g)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error ?? `Lookup failed (${res.status})`);
      }
      const fetched = (await res.json()) as GstPrefillData;
      setData(fetched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!data) return;
    onApply(data);
    toast.success("Customer details prefilled");
    setOpen(false);
    setData(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="link" size="sm" className="px-0">
          Prefill from GSTIN ›
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prefill from GST portal</DialogTitle>
          <DialogDescription>
            Enter the customer&apos;s GSTIN to fetch name and address details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="font-mono"
            />
          </div>
          {data ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
              <div className="font-semibold">{data.legalName}</div>
              {data.tradeName && data.tradeName !== data.legalName ? (
                <div className="text-xs text-muted-foreground">
                  {data.tradeName}
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground whitespace-pre-line">
                {[
                  data.addressLine1,
                  data.addressLine2,
                  [data.city, data.state, data.zipCode].filter(Boolean).join(", "),
                  data.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          {!data ? (
            <Button onClick={lookup} disabled={busy} className="gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Look up
            </Button>
          ) : (
            <Button onClick={apply}>Apply</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
