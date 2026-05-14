"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewBaseCurrencyAdjustmentDialog } from "./new-adjustment-dialog";

/**
 * ACCT-C.3 — "+ New" button on the list page. Splits the
 * server-fetched data (accounts list, base currency) from the
 * stateful dialog open/close so the server component can stay
 * server-side.
 */
export function NewBaseCurrencyAdjustmentButton({
  accounts,
  baseCurrency,
}: {
  accounts: Array<{
    id: string;
    name: string;
    code: string | null;
    type: string;
  }>;
  baseCurrency: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> New
      </Button>
      <NewBaseCurrencyAdjustmentDialog
        open={open}
        onOpenChange={setOpen}
        accounts={accounts}
        baseCurrency={baseCurrency}
      />
    </>
  );
}
