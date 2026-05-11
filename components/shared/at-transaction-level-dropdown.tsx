"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Collapsible "At Transaction Level" section on Bill / Recurring Bill /
 * Vendor Credit forms. v1: single Place-of-Supply select. Full GST
 * stacking (multiple rates, reverse charge, etc) lands behind a
 * gst.advanced flag in a follow-up patch.
 *
 * Reused on the customer side (it's also "At Transaction Level" on
 * sales invoices) but the spec specifically calls it out for the
 * purchase forms.
 */
const INDIAN_STATES = [
  ["35", "Andaman & Nicobar"],
  ["37", "Andhra Pradesh"],
  ["12", "Arunachal Pradesh"],
  ["18", "Assam"],
  ["10", "Bihar"],
  ["04", "Chandigarh"],
  ["22", "Chhattisgarh"],
  ["26", "Dadra & Nagar Haveli and Daman & Diu"],
  ["07", "Delhi"],
  ["30", "Goa"],
  ["24", "Gujarat"],
  ["06", "Haryana"],
  ["02", "Himachal Pradesh"],
  ["01", "Jammu & Kashmir"],
  ["20", "Jharkhand"],
  ["29", "Karnataka"],
  ["32", "Kerala"],
  ["38", "Ladakh"],
  ["31", "Lakshadweep"],
  ["23", "Madhya Pradesh"],
  ["27", "Maharashtra"],
  ["14", "Manipur"],
  ["17", "Meghalaya"],
  ["15", "Mizoram"],
  ["13", "Nagaland"],
  ["21", "Odisha"],
  ["34", "Puducherry"],
  ["03", "Punjab"],
  ["08", "Rajasthan"],
  ["11", "Sikkim"],
  ["33", "Tamil Nadu"],
  ["36", "Telangana"],
  ["16", "Tripura"],
  ["09", "Uttar Pradesh"],
  ["05", "Uttarakhand"],
  ["19", "West Bengal"],
  ["97", "Other Territory"],
];

export function AtTransactionLevelDropdown({
  value,
  onChange,
  defaultOpen = false,
}: {
  /** State code (2-digit). Stored as Bill/PO/VC.placeOfSupply. */
  value: string | null;
  onChange: (v: string | null) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <span>At Transaction Level</span>
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open ? (
        <div className="border-t px-3 py-3 space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Place of Supply
          </label>
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">— Select state —</option>
            {INDIAN_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Determines the GST split (CGST+SGST when intra-state,
            IGST otherwise) on this transaction.
          </p>
        </div>
      ) : null}
    </div>
  );
}
