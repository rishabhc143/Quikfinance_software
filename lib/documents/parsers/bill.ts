/**
 * DOC-D2.3: Vendor bill / GST tax invoice parser.
 *
 * Extracts the fields needed to prefill a `Bill` draft:
 *   - vendorName: best-guess from header lines or "From:" labels
 *   - gstin: 15-char Indian GSTIN pattern (strong cue)
 *   - billNumber: matches "Invoice No / Bill No / Number" labels
 *   - issueDate + dueDate: parsed via shared `parseInrDate`
 *   - subTotal + taxAmount + total: keyword scan with fallbacks
 *   - lineItems: best-effort line-by-line scan (D2.3 v1 keeps simple
 *     description+amount pairs; multi-column tables come in D2.5)
 *
 * The parser is forgiving — it returns a `ParsedBill` even when most
 * fields are null, so the user can still review-and-fill in the
 * Create Bill modal. The classifier already confirmed the doc IS a
 * bill, so we trust that and best-effort fill what we can find.
 */

import {
  parseInrAmount,
  parseInrDate,
} from "./bank-statement-types";

export type ParsedBillLineItem = {
  description: string;
  quantity?: number;
  rate?: number;
  amount: number;
};

export type ParsedBill = {
  vendorName?: string;
  gstin?: string;
  billNumber?: string;
  issueDate?: string; // yyyy-MM-dd
  dueDate?: string;
  subTotal?: number;
  taxAmount?: number;
  total?: number;
  lineItems: ParsedBillLineItem[];
};

const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/;

/**
 * Type guard for unsafe data read out of `Document.extractedFields`
 * (it's JSONB so the shape isn't statically guaranteed).
 */
export function isParsedBill(v: unknown): v is ParsedBill {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.lineItems);
}

function findGstin(text: string): string | undefined {
  const m = text.match(GSTIN_RE);
  return m ? m[1] : undefined;
}

function findBillNumber(text: string): string | undefined {
  // Try the most specific labels first.
  const labels = [
    /(?:Invoice|Bill)\s*(?:Number|No|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
    /Invoice\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  ];
  for (const re of labels) {
    const m = text.match(re);
    if (m && m[1] && m[1].length >= 2) return m[1];
  }
  return undefined;
}

/**
 * Tight capture for a single date value after a labelled prefix:
 * either dd/MM/yyyy / dd-MM-yyyy numeric form OR dd MMM yyyy named
 * form. Constrains the match so we don't accidentally swallow the
 * next label (e.g. "Due Date:") into the captured group.
 */
const DATE_VALUE_RE = String.raw`(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+[A-Za-z]+\s+\d{2,4})`;

function findIssueDate(text: string): string | undefined {
  const re = new RegExp(
    String.raw`(?:Invoice\s+Date|Bill\s+Date|Issue\s+Date|Date)\s*[:\-]?\s*` +
      DATE_VALUE_RE,
    "i"
  );
  const m = text.match(re);
  if (!m) return undefined;
  return parseInrDate(m[1]) ?? undefined;
}

function findDueDate(text: string): string | undefined {
  const re = new RegExp(
    String.raw`Due\s+Date\s*[:\-]?\s*` + DATE_VALUE_RE,
    "i"
  );
  const m = text.match(re);
  if (!m) return undefined;
  return parseInrDate(m[1]) ?? undefined;
}

function findTotal(text: string): number | undefined {
  // Multiple plausible labels — pick the largest match because the
  // grand total is always the biggest amount in the doc.
  const re = /(?:Grand\s+Total|Total\s+Amount|Total\s+Payable|Bill\s+Amount|Amount\s+Due|Amount\s+Payable|Total)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/gi;
  let best: number | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseInrAmount(m[1]);
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  return best;
}

function findSubTotal(text: string): number | undefined {
  const m = text.match(/Sub\s*Total\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return undefined;
  const n = parseInrAmount(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function findTaxAmount(text: string): number | undefined {
  // Sum CGST + SGST + IGST when all present, else fall back to a
  // single "Tax" / "GST" line.
  const cg = text.match(/CGST(?:\s*@?\s*\d+%?)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  const sg = text.match(/SGST(?:\s*@?\s*\d+%?)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  const ig = text.match(/IGST(?:\s*@?\s*\d+%?)?\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  const cgVal = cg ? parseInrAmount(cg[1]) : NaN;
  const sgVal = sg ? parseInrAmount(sg[1]) : NaN;
  const igVal = ig ? parseInrAmount(ig[1]) : NaN;
  let sum = 0;
  let anyFound = false;
  if (Number.isFinite(cgVal)) { sum += cgVal; anyFound = true; }
  if (Number.isFinite(sgVal)) { sum += sgVal; anyFound = true; }
  if (Number.isFinite(igVal)) { sum += igVal; anyFound = true; }
  if (anyFound) return sum;
  const tx = text.match(/(?:Total\s+Tax|GST|Tax\s+Amount)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i);
  if (tx) {
    const n = parseInrAmount(tx[1]);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Vendor name heuristic: the first non-trivial line that isn't the
 * doc title ("Tax Invoice" / "Bill of Supply"), isn't a label
 * ("Invoice Date"), and looks like a company / proper name. Returns
 * the first such line (max 80 chars).
 */
function findVendorName(text: string): string | undefined {
  const ignore = /^(tax\s+invoice|bill\s+of\s+supply|invoice|bill|to\b|from\b|gstin|invoice\s+(no|number|date)|date\b|billing|shipping|page\b|original|duplicate|customer|credit\s+note|debit\s+note)/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length < 3) continue;
    if (line.length > 80) continue;
    if (ignore.test(line)) continue;
    if (/^[\d\s\-\.,]+$/.test(line)) continue; // numbers-only
    if (/[@()_]/.test(line)) continue; // email / weird chars
    return line;
  }
  return undefined;
}

/**
 * Line item scan — light heuristic. Looks for lines that end with two
 * numeric-looking tokens (rate, amount) preceded by a description. We
 * skip totals/tax rows so they don't show up as items.
 *
 * v1 returns at most 20 line items; multi-page bills with hundreds of
 * rows fall back to a manual entry workflow in the Create Bill modal.
 */
function findLineItems(text: string): ParsedBillLineItem[] {
  // Skip lines that look like headers / labels / totals / dates / etc.
  // We've widened this list as real bills surface false-positives.
  const skipPrefix =
    /^(sub\s*total|grand\s+total|total|cgst|sgst|igst|tax|gst|amount|balance|received|due|payment|opening|closing|page|notes?|date|invoice|bill|issue|gstin|hsn|sac|description|rate|qty|quantity|s\s*\.?\s*no|sr\s*\.?\s*no|item|particulars|customer|vendor|supplier|terms|place\s+of\s+supply|bill\s+to|ship\s+to|from\b|to\b|po\s+no|reference|ref)/i;
  const items: ParsedBillLineItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length < 6) continue;
    if (skipPrefix.test(line)) continue;
    // Need at least 2 amount-like tokens at the end.
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    const lastAmt = parseInrAmount(last);
    const secLastAmt = parseInrAmount(secondLast);
    if (!Number.isFinite(lastAmt) || lastAmt <= 0) continue;
    const description = parts
      .slice(0, Number.isFinite(secLastAmt) ? parts.length - 2 : parts.length - 1)
      .join(" ")
      .replace(/^\d+\s+/, "") // strip leading serial number
      .trim();
    if (description.length < 3) continue;
    if (/^[\d\s,.\-]+$/.test(description)) continue;
    items.push({
      description: description.slice(0, 200),
      rate: Number.isFinite(secLastAmt) ? secLastAmt : undefined,
      amount: lastAmt,
    });
    if (items.length >= 20) break;
  }
  return items;
}

/**
 * Top-level bill parser. Returns a ParsedBill where most fields may
 * be undefined when not detected.
 */
export function parseBill(text: string): ParsedBill {
  return {
    vendorName: findVendorName(text),
    gstin: findGstin(text),
    billNumber: findBillNumber(text),
    issueDate: findIssueDate(text),
    dueDate: findDueDate(text),
    subTotal: findSubTotal(text),
    taxAmount: findTaxAmount(text),
    total: findTotal(text),
    lineItems: findLineItems(text),
  };
}
