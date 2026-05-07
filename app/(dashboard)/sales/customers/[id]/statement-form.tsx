"use client";

import * as React from "react";
import { Loader2, FileDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/shared/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";

export function StatementForm({
  customerId,
  customerEmail,
  emailAction,
}: {
  customerId: string;
  customerEmail: string | null;
  emailAction: (input: {
    contactId: string;
    from: string;
    to: string;
  }) => Promise<unknown>;
}) {
  const today = new Date();
  const yearAgo = new Date(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const [from, setFrom] = React.useState<Date>(yearAgo);
  const [to, setTo] = React.useState<Date>(today);
  const [busy, setBusy] = React.useState(false);

  const fromIso = format(from, "yyyy-MM-dd");
  const toIso = format(to, "yyyy-MM-dd");
  const pdfHref = `/sales/customers/${customerId}/statement?from=${fromIso}&to=${toIso}`;

  async function emailIt() {
    if (!customerEmail) {
      toast.error("Customer has no email on file");
      return;
    }
    setBusy(true);
    try {
      await emailAction({ contactId: customerId, from: fromIso, to: toIso });
      toast.success("Statement email queued");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to queue email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>From</Label>
          <DatePicker value={from} onChange={(d) => d && setFrom(d)} />
        </div>
        <div className="space-y-2">
          <Label>To</Label>
          <DatePicker value={to} onChange={(d) => d && setTo(d)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild className="gap-1">
          <a href={pdfHref} target="_blank" rel="noopener">
            <FileDown className="h-4 w-4" /> View PDF
          </a>
        </Button>
        <Button
          variant="outline"
          onClick={emailIt}
          disabled={busy || !customerEmail}
          className="gap-1"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Email statement
        </Button>
      </div>
      {!customerEmail ? (
        <p className="text-xs text-muted-foreground">
          Add an email address to this customer to enable emailing.
        </p>
      ) : null}
    </div>
  );
}
