/**
 * Per-tax-rate aggregation for invoice PDF rendering.
 *
 * Given a flat list of invoice lines with `amount + taxRate`,
 * group them into `{ label: "IGST18 (18%)", amount: ... }`
 * rows for the totals stack at the bottom-right of the PDF.
 *
 * Pure function — no DB calls, no I/O. Unit-tested.
 */

export type LineForTax = {
  /** Line subtotal BEFORE tax */
  amount: number;
  /** Tax rate as a percentage (18 means 18%) */
  taxRate: number;
  /** Tax kind. Defaults to IGST for inter-state, used to label the row. */
  taxKind?: "IGST" | "CGST" | "SGST" | "CESS" | null;
};

export type TaxBreakdownRow = {
  label: string; // e.g. "IGST18 (18%)"
  amount: number; // tax amount for this rate
};

/**
 * Groups lines by (taxKind, taxRate) and returns a list of label
 * + total-tax rows. Lines with taxRate = 0 are skipped.
 */
export function groupByTaxRate(lines: LineForTax[]): TaxBreakdownRow[] {
  const buckets = new Map<string, TaxBreakdownRow>();
  for (const ln of lines) {
    if (!ln.taxRate || ln.taxRate <= 0) continue;
    const kind = ln.taxKind ?? "IGST";
    const key = `${kind}|${ln.taxRate}`;
    const tax = round2((ln.amount * ln.taxRate) / 100);
    const existing = buckets.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + tax);
    } else {
      // Label matches the reference PDF: "IGST18 (18%)"
      const label = `${kind}${formatRate(ln.taxRate)} (${formatRate(
        ln.taxRate
      )}%)`;
      buckets.set(key, { label, amount: tax });
    }
  }
  return Array.from(buckets.values());
}

/**
 * Subtotal = sum of pre-tax line amounts.
 */
export function subtotal(lines: LineForTax[]): number {
  return round2(lines.reduce((acc, ln) => acc + (ln.amount || 0), 0));
}

/**
 * Grand total = subtotal + sum of all tax buckets.
 */
export function grandTotal(lines: LineForTax[]): number {
  const sub = subtotal(lines);
  const totalTax = groupByTaxRate(lines).reduce(
    (acc, b) => acc + b.amount,
    0
  );
  return round2(sub + totalTax);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatRate(rate: number): string {
  // 18 → "18", 12.5 → "12.5". No trailing zeros.
  return Number.isInteger(rate) ? String(rate) : String(rate);
}
