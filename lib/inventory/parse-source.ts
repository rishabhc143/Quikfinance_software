/**
 * Pure helper: parse the source-document type + number out of a
 * standard `InventoryAdjustment.reason` string.
 *
 * Reason strings are produced by the helpers in
 * `lib/inventory/stock-mutations.ts`:
 *   - "Invoice <number>"             — invoice decrement
 *   - "Reverse Invoice <number>"     — invoice void/delete
 *   - "Credit Note <number>"         — credit-note return
 *   - "Reverse Credit Note <number>" — credit-note void/delete
 *
 * Anything else (e.g. user-created manual adjustments via the
 * /items/inventory-adjustments page) returns null.
 *
 * Used by the adjustment-history dialog to render a deep-link to
 * the source document.
 */
export function parseSourceFromReason(
  reason: string
): { type: "invoice" | "credit-note"; number: string } | null {
  const m = reason.match(/^(?:Reverse\s+)?(Invoice|Credit Note)\s+(.+)$/);
  if (!m) return null;
  return {
    type: m[1] === "Invoice" ? "invoice" : "credit-note",
    number: m[2].trim(),
  };
}
