"use client";

import * as React from "react";
import { Loader2, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertQuoteToInvoiceAction } from "../actions";
import { toast } from "sonner";

export function ConvertButton({ quoteId }: { quoteId: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Convert this quote to an invoice?")) return;
        setBusy(true);
        try { await convertQuoteToInvoiceAction(quoteId); }
        catch (err) { toast.error(err instanceof Error ? err.message : "Convert failed"); setBusy(false); }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileCheck className="h-4 w-4 mr-1" />}
      Convert to invoice
    </Button>
  );
}
