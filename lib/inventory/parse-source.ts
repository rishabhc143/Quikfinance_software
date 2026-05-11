/**
 * Pure helper: parse the source-document type + number out of a
 * standard `InventoryAdjustment.reason` string.
 *
 * Reason strings are produced by the helpers in
 * `lib/inventory/stock-mutations.ts`:
 *   - "Invoice <number>"                 — invoice decrement
 *   - "Reverse Invoice <number>"         — invoice void/delete
 *   - "Credit Note <number>"             — credit-note return
 *   - "Reverse Credit Note <number>"     — credit-note void/delete
 *   - "DeliveryChallan <number>"         — DC ship
 *   - "Reverse DeliveryChallan <number>" — DC return/void
 *
 * Anything else (e.g. user-created manual adjustments via the
 * /items/inventory-adjustments page) returns null.
 *
 * Used by the adjustment-history dialog to render a deep-link to
 * the source document.
 */
export function parseSourceFromReason(
  reason: string
):
  | {
      type: "invoice" | "credit-note" | "delivery-challan";
      number: string;
    }
  | null {
  const m = reason.match(
    /^(?:Reverse\s+)?(Invoice|Credit Note|DeliveryChallan)\s+(.+)$/
  );
  if (!m) return null;
  const type =
    m[1] === "Invoice"
      ? "invoice"
      : m[1] === "Credit Note"
      ? "credit-note"
      : "delivery-challan";
  return { type, number: m[2].trim() };
}
