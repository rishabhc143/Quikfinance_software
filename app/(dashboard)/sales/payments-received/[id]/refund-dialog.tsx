"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/shared/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";

export function RefundPaymentDialog({
  paymentId,
  number,
  amount,
  currency,
  paymentMode,
  action,
  trigger,
}: {
  paymentId: string;
  number: string;
  amount: number;
  currency: string;
  /** M30: when "razorpay", the dialog warns that the refund hits
   *  Razorpay's API and is irreversible. */
  paymentMode?: string | null;
  action: (
    id: string,
    input: { refundDate: Date | string; reference?: string | null; notes?: string | null }
  ) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refundDate, setRefundDate] = React.useState<Date>(new Date());
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function submit() {
    setBusy(true);
    try {
      await action(paymentId, {
        refundDate: format(refundDate, "yyyy-MM-dd"),
        reference: reference || null,
        notes: notes || null,
      });
      toast.success("Payment refunded");
      setOpen(false);
      router.push("/sales/payments-received");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {paymentMode === "razorpay"
              ? `Refund Razorpay payment ${number}`
              : `Refund payment ${number}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {paymentMode === "razorpay" ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <strong>This refund hits Razorpay&apos;s API.</strong> The full
              payment of {amount.toFixed(2)} {currency} will be returned to the
              customer&apos;s card / UPI account, and the local invoice
              balance will be rolled back. The Razorpay refund usually
              settles in 5–7 business days. This action is irreversible.
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              This will reverse the full payment of {amount.toFixed(2)}{" "}
              {currency} and roll back any invoice allocations. A reversal
              entry is created so the audit trail is intact.
            </div>
          )}
          <Label>Refund date</Label>
          <DatePicker value={refundDate} onChange={(d) => d && setRefundDate(d)} />
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-1" variant="destructive">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
