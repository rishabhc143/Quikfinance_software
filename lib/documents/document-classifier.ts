/**
 * DOC-D2.1: Document type classifier — keyword-based heuristic.
 *
 * Pure function. Given the extracted text from a PDF, returns a
 * `{ type, confidence }` pair. Designed to be cheap (single pass over
 * the text, no regex backtracking) and explainable (every rule lives
 * in one switch-like dispatcher).
 *
 * Keyword strategy:
 *   - BANK_STATEMENT: bank names + statement-y phrases + IFSC pattern
 *   - BILL / INVOICE: GSTIN + "Tax Invoice" / "Bill" + numeric total
 *   - RECEIPT: "Receipt" / "Paid" / short total
 *   - CONTRACT: legal-doc phrases (Agreement, Parties, Effective Date)
 *   - UNKNOWN: fallback when no rule fires
 *
 * Confidence is a coarse heuristic 0-1 score derived from how many
 * cues matched. Not a probability — just useful for the UI to
 * surface "weak match" warnings later if we add per-type "Create X"
 * actions in D2.2+.
 *
 * All matching is case-insensitive. Tested against fixture-style
 * text in `document-classifier.test.ts`.
 */

import type { DocumentType } from "./document-types";

export type ClassificationResult = {
  type: DocumentType;
  confidence: number; // 0-1, coarse
  matchedCues: string[]; // for debug + future "why?" tooltip
};

const BANK_KEYWORDS = [
  "HDFC BANK",
  "HDFC Bank",
  "ICICI BANK",
  "ICICI Bank",
  "AXIS BANK",
  "Axis Bank",
  "STATE BANK OF INDIA",
  "State Bank of India",
  "KOTAK MAHINDRA",
  "Kotak Mahindra",
  "IDFC FIRST",
  "Yes Bank",
  "IndusInd",
  "BANK OF BARODA",
  "Bank of Baroda",
  "Punjab National",
  "Canara Bank",
  "Union Bank",
];

const STATEMENT_PHRASES = [
  "Statement of Account",
  "Account Statement",
  "Statement Period",
  "Opening Balance",
  "Closing Balance",
  "Available Balance",
  "Account Number",
  "A/C No",
  "Account No",
  "Transaction Date",
  "Value Date",
  "Withdrawal",
  "Deposit",
];

// IFSC code: 4 letters + "0" + 6 alphanumerics. Strong cue for a bank doc.
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/;

// GSTIN: 15 chars — 2 digits state + 10 PAN + 1 entity + 1 'Z' + 1 check.
const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/;

const INVOICE_PHRASES = [
  "Tax Invoice",
  "GST Invoice",
  "Invoice Number",
  "Invoice No",
  "Invoice Date",
  "Place of Supply",
  "Bill To",
  "Ship To",
  "HSN/SAC",
  "HSN",
  "SAC",
  "CGST",
  "SGST",
  "IGST",
  "Total Amount",
  "Grand Total",
  "Sub Total",
];

const BILL_PHRASES = [
  "Bill of Supply",
  "Bill No",
  "Bill Number",
  "Vendor",
  "Supplier",
  "Purchase Order",
  "Payment Terms",
  "Due Date",
];

const RECEIPT_PHRASES = [
  "Receipt",
  "Payment Receipt",
  "Receipt Number",
  "Amount Paid",
  "Paid By",
  "Thank you for your payment",
];

const CONTRACT_PHRASES = [
  "Agreement",
  "Contract",
  "Parties",
  "Effective Date",
  "Witnesseth",
  "WHEREAS",
  "Hereinafter",
  "Terms and Conditions",
];

/**
 * Count case-insensitive substring matches in `text` for each
 * phrase in `phrases`. Returns the list of phrases that hit (used
 * both for the score + the matchedCues debug array).
 */
function findCues(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const p of phrases) {
    if (lower.includes(p.toLowerCase())) found.push(p);
  }
  return found;
}

/**
 * Run the classifier against extracted text. Returns the best-match
 * type + a confidence score. Falls back to UNKNOWN when text is
 * empty / null / no rules fire.
 */
export function classifyDocument(
  text: string | null | undefined
): ClassificationResult {
  if (!text || text.trim().length < 20) {
    return { type: "UNKNOWN", confidence: 0, matchedCues: [] };
  }

  const bankCues = findCues(text, BANK_KEYWORDS);
  const stmtCues = findCues(text, STATEMENT_PHRASES);
  const ifscMatch = IFSC_RE.test(text);
  const gstinMatch = GSTIN_RE.test(text);
  const invoiceCues = findCues(text, INVOICE_PHRASES);
  const billCues = findCues(text, BILL_PHRASES);
  const receiptCues = findCues(text, RECEIPT_PHRASES);
  const contractCues = findCues(text, CONTRACT_PHRASES);

  // Score per category. Tunable weights — `stmtCues` is the strongest
  // bank-statement signal because most bank PDFs include 2-3 of those
  // phrases at minimum.
  const bankScore =
    bankCues.length * 0.4 +
    stmtCues.length * 0.25 +
    (ifscMatch ? 0.5 : 0);
  const invoiceScore =
    invoiceCues.length * 0.25 + (gstinMatch ? 0.4 : 0);
  const billScore =
    billCues.length * 0.25 + (gstinMatch ? 0.3 : 0);
  const receiptScore = receiptCues.length * 0.4;
  const contractScore = contractCues.length * 0.3;

  // Pick the strongest. Ties default to BANK_STATEMENT because that's
  // the most common SMB use-case and the one we'll wire first in D2.2.
  const choices = [
    { type: "BANK_STATEMENT" as DocumentType, score: bankScore, cues: [...bankCues, ...stmtCues, ifscMatch ? "IFSC code" : ""].filter(Boolean) },
    { type: "INVOICE" as DocumentType, score: invoiceScore, cues: [...invoiceCues, gstinMatch ? "GSTIN" : ""].filter(Boolean) },
    { type: "BILL" as DocumentType, score: billScore, cues: [...billCues, gstinMatch ? "GSTIN" : ""].filter(Boolean) },
    { type: "RECEIPT" as DocumentType, score: receiptScore, cues: receiptCues },
    { type: "CONTRACT" as DocumentType, score: contractScore, cues: contractCues },
  ];

  let best = choices[0];
  for (const c of choices) {
    if (c.score > best.score) best = c;
  }

  // Threshold: below 0.5 we're not confident enough to call it.
  if (best.score < 0.5) {
    return { type: "UNKNOWN", confidence: best.score, matchedCues: [] };
  }

  // Normalise confidence to 0-1 (cap at 1.0). Anything above 2.0 raw
  // is comfortably above the threshold and we just clamp it.
  const confidence = Math.min(1, best.score / 2);
  return { type: best.type, confidence, matchedCues: best.cues };
}
