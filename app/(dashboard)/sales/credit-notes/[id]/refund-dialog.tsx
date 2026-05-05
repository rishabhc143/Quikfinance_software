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
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { format } from "date-fns";
import { toast } from "sonner";
import type { RefundCreditInput } from "@/lib/validations/credit-note";

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit_card", label: "Credit Card" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" },
];

export function RefundCreditDialog({
  creditNoteId,
  balance,
  action,
  trigger,
}: {
  creditNoteId: string;
  balance: number;
  action: (id: string, input: RefundCreditInput) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refundDate, setRefundDate] = React.useState<Date>(new Date());
  const [amount, setAmount] = React.useState("0");
  const [mode, setMode] = React.useState<RefundCreditInput["mode"]>("bank_transfer");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function submit() {
    if (Number(amount) <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    setBusy(true);
    try {
      await action(creditNoteId, {
        refundDate: format(refundDate, "yyyy-MM-dd") as unknown as Date,
        amount: Number(amount),
        mode,
        reference: reference || null,
        fromAccountId: null,
        notes: notes || null,
      });
      toast.success("Refund recorded");
      setOpen(false);
      router.refresh();
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
          <DialogTitle>Refund credit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Available balance: {balance.toFixed(2)}
          </div>
          <Label>Refund date</Label>
          <DatePicker value={refundDate} onChange={(d) => d && setRefundDate(d)} />
          <Label>Amount</Label>
          <MoneyInput value={amount} onChange={setAmount} />
          <Label>Mode</Label>
          <Combobox
            options={MODES}
            value={mode}
            onChange={(v) => setMode((v as RefundCreditInput["mode"]) ?? "bank_transfer")}
          />
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
