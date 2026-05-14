import { redirect } from "next/navigation";

/**
 * ACCT-C.3 — The "+ New" flow moved from a standalone page to a
 * modal dialog on the list page. This stub keeps existing `/new`
 * links working by bouncing them to the list page (where the
 * "+ New" button opens the modal).
 */
export default function NewBaseCurrencyAdjustmentRedirect(): never {
  redirect("/accountant/currency-adjustments");
}
