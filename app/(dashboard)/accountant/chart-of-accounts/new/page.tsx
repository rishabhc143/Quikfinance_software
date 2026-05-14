import { redirect } from "next/navigation";

/**
 * ACCT-E.3 — The "New Account" flow moved from a standalone page
 * to a modal dialog on the list page. This stub keeps existing
 * `/new` links working by bouncing them to the list page (where
 * the "+ New" button opens the modal).
 */
export default function NewAccountRedirect(): never {
  redirect("/accountant/chart-of-accounts");
}
