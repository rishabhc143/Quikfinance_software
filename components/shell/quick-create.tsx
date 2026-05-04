"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Group = { name: string; items: { label: string; href: string }[] };

const GROUPS: Group[] = [
  {
    name: "GENERAL",
    items: [
      { label: "Add User", href: "/settings/users/new" },
      { label: "Item", href: "/items/new" },
      { label: "Journal Entry", href: "/accountant/journal-entries/new" },
      { label: "Log Time", href: "/time/entries/new" },
      { label: "Weekly Log", href: "/time/weekly-log" },
    ],
  },
  {
    name: "INVENTORY",
    items: [{ label: "Inventory Adjustments", href: "/items/inventory-adjustments/new" }],
  },
  {
    name: "SALES",
    items: [
      { label: "Customer", href: "/contacts/new?type=customer" },
      { label: "Quotes", href: "/sales/quotes/new" },
      { label: "Delivery Challan", href: "/sales/delivery-challans/new" },
      { label: "Invoices", href: "/sales/invoices/new" },
      { label: "Recurring Invoice", href: "/sales/recurring-invoices/new" },
      { label: "Retail Invoice", href: "/sales/retail-invoices/new" },
      { label: "Sales Order", href: "/sales/orders/new" },
      { label: "Customer Payment", href: "/sales/payments-received/new" },
      { label: "Credit Notes", href: "/sales/credit-notes/new" },
    ],
  },
  {
    name: "PURCHASES",
    items: [
      { label: "Vendor", href: "/contacts/new?type=vendor" },
      { label: "Expenses", href: "/purchases/expenses/new" },
      { label: "Recurring Expense", href: "/purchases/recurring-expenses/new" },
      { label: "Bill", href: "/purchases/bills/new" },
      { label: "Recurring Bill", href: "/purchases/recurring-bills/new" },
      { label: "Purchase Order", href: "/purchases/orders/new" },
      { label: "Vendor Payment", href: "/purchases/payments-made/new" },
      { label: "Vendor Credit", href: "/purchases/vendor-credits/new" },
    ],
  },
  {
    name: "BANKING",
    items: [
      { label: "Bank Transfer", href: "/banking/transfers/new" },
      { label: "Card Payment", href: "/banking/card-payments/new" },
      { label: "Owner Drawings", href: "/banking/owner-drawings/new" },
      { label: "Other Income", href: "/banking/other-income/new" },
    ],
  },
];

export function QuickCreate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="contents">{children}</button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create</DialogTitle>
          <DialogDescription>Pick what you want to add. New items open the matching form.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mt-2">
          {GROUPS.map((g) => (
            <div key={g.name}>
              <h4 className="text-xs font-semibold text-muted-foreground tracking-wider mb-2">{g.name}</h4>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="block px-2 py-1.5 rounded hover:bg-accent text-sm"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
