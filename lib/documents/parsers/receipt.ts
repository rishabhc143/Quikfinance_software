/**
 * DOC-D2.3: Receipt parser — simpler cousin to the bill parser.
 *
 * Receipts have less structure than vendor bills:
 *   - Often just a vendor name + total + date
 *   - No GSTIN, no formal line items, no due date
 *   - Total is usually labelled "Total" / "Amount Paid" / "Paid" /
 *     "Grand Total" or the largest "₹X" / "Rs X" / "INR X" amount
 *
 * We extract just enough to prefill an Expense draft.
 */

import { parseInrAmount, parseInrDate } from "./bank-statement-types";

export type ParsedReceipt = {
  vendorName?: string;
  date?: string; // yyyy-MM-dd
  total?: number;
  /** Payment mode if mentioned ("Cash", "UPI", "Card"). */
  paidVia?: string;
};

export function isParsedReceipt(v: unknown): v is ParsedReceipt {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  // We can't tell apart from ParsedBill cleanly without the lineItems
  // marker. Caller passes documentType to disambiguate.
  return "total" in o || "date" in o || "vendorName" in o;
}

function findTotal(text: string): number | undefined {
  // Try labelled amounts first. Pick the largest match — the grand
  // total is the biggest number on a receipt.
  const re = /(?:Grand\s+Total|Total\s+Amount|Total\s+Payable|Amount\s+Paid|Amount\s+Due|Total|Paid)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/gi;
  let best: number | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInrAmount(m[1]);
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  if (best != null) return best;
  // Fallback: any ₹/Rs/INR + number. Largest wins.
  const re2 = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d+)?)/gi;
  while ((m = re2.exec(text))) {
    const n = parseInrAmount(m[1]);
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  return best;
}

function findDate(text: string): string | undefined {
  // Try "Date:" labelled value first.
  const labelled = text.match(
    /(?:Date|Receipt\s+Date|Issued)\s*[:\-]?\s*(\S+(?:\s+\S+\s+\S+)?)/i
  );
  if (labelled) {
    const d = parseInrDate(labelled[1].split(/\s+to\s+/)[0]);
    if (d) return d;
  }
  // Fallback: scan for any date-looking token on its own.
  const numericDate = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (numericDate) return parseInrDate(numericDate[1]) ?? undefined;
  const namedDate = text.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{2,4})\b/);
  if (namedDate) return parseInrDate(namedDate[1]) ?? undefined;
  return undefined;
}

function findPaidVia(text: string): string | undefined {
  if (/\bcash\b/i.test(text) && /paid|payment\s+mode|paid\s+by|paid\s+via/i.test(text)) {
    return "Cash";
  }
  if (/\bupi\b/i.test(text)) return "UPI";
  if (/credit\s+card|debit\s+card|\bcard\b/i.test(text)) return "Card";
  if (/\bcheque|check\b/i.test(text)) return "Cheque";
  if (/\bneft\b/i.test(text)) return "NEFT";
  if (/\brtgs\b/i.test(text)) return "RTGS";
  return undefined;
}

function findVendorName(text: string): string | undefined {
  // Same heuristic as bill parser, with a slightly different ignore
  // list (receipts have different boilerplate).
  const ignore = /^(receipt|payment\s+receipt|cash\s+receipt|tax\s+invoice|invoice|date\b|receipt\s+(no|number|date)|received\s+from|paid\s+by|original|duplicate|thank\s+you|customer)/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length < 3) continue;
    if (line.length > 80) continue;
    if (ignore.test(line)) continue;
    if (/^[\d\s\-\.,]+$/.test(line)) continue;
    if (/[@()_]/.test(line)) continue;
    return line;
  }
  return undefined;
}

export function parseReceipt(text: string): ParsedReceipt {
  return {
    vendorName: findVendorName(text),
    date: findDate(text),
    total: findTotal(text),
    paidVia: findPaidVia(text),
  };
}
