import { revalidatePath } from "next/cache";

/**
 * Audit r3 R2-8 lite: variadic wrapper for the very common pattern in
 * server actions:
 *
 *   revalidatePath("/sales/invoices");
 *   revalidatePath(`/sales/invoices/${id}`);
 *
 * which becomes:
 *
 *   revalidatePaths("/sales/invoices", `/sales/invoices/${id}`);
 *
 * Saves one line per call site (small win, but real — applied across
 * 29 action files). Not the full audit-log-+-revalidate-+-redirect
 * helper the audit suggested; that combined version turned out to be
 * net-negative because the redirect call has to throw, making the
 * helper signature awkward. This one is just a thin sugar.
 */
export function revalidatePaths(...paths: string[]): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}
