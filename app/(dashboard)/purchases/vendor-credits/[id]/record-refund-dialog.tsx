"use client";

import * as React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/shared/money-input";
import { formatMoney } from "@/lib/money";
import type { RecordVendorCreditRefundInput } from "@/lib/validations/vendor-credit";

type Props = {
  vendorCreditId: string;
  currency: string;
  remaining: number;
  refundAction: (input: RecordVendorCreditRefundInput) => Promise<unknown>;
  trigger: React.ReactNode;
};

const PAYMENT_MODES = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
];

export function RecordRefundDialog({
  vendorCreditId,
  currency,
  remaining,
  refundAction,
  trigger,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<string>(String(remaining));
  const [refundDate, setRefundDate] = React.useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [paymentMode, setPaymentMode] = React.useState("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const amountNum = Number(amount) || 0;
  const overLimit = amountNum > remaining + 0.001;

  async function submit() {
    if (amountNum <= 0) {
      toast.error("Enter a refund amount");
      return;
    }
    if (overLimit) {
      toast.error(
        `Refund exceeds remaining ${formatMoney(remaining, currency)}`
      );
      return;
    }
    setBusy(true);
    try {
      await refundAction({
        vendorCreditId,
        amount: amountNum,
        refundDate: new Date(refundDate),
        paymentMode: paymentMode as RecordVendorCreditRefundInput["paymentMode"],
        reference: reference || null,
        notes: notes || null,
      });
      toast.success(
        `Refund of ${formatMoney(amountNum, currency)} recorded`
      );
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record refund</DialogTitle>
          <DialogDescription>
            Refund up to{" "}
            <strong className="tabular-nums">
              {formatMoney(remaining, currency)}
            </strong>{" "}
            from this vendor credit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="refund-amount">Amount *</Label>
            <MoneyInput
              value={amount}
              onChange={setAmount}
              currencyCode={currency}
            />
            {overLimit ? (
              <p className="mt-1 text-xs text-destructive">
                Exceeds remaining balance.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="refund-date">Refund date *</Label>
            <Input
              id="refund-date"
              type="date"
              value={refundDate}
              onChange={(e) => setRefundDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Payment mode</Label>
            <Combobox
              options={PAYMENT_MODES}
              value={paymentMode}
              onChange={(v) => setPaymentMode(v ?? "bank_transfer")}
            />
          </div>
          <div>
            <Label htmlFor="refund-ref">Reference</Label>
            <Input
              id="refund-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque #, transaction id, etc."
            />
          </div>
          <div>
            <Label htmlFor="refund-notes">Notes</Label>
            <Textarea
              id="refund-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={busy || amountNum <= 0 || overLimit}
            className="gap-1"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
