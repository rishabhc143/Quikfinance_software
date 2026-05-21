/**
 * DOC-D2.2: Bank statement parser entry point.
 *
 * `parseBankStatement(text)` is the single function the rest of the
 * codebase calls. It picks the right per-bank parser via `detectBank`,
 * runs it, and returns the structured `ParsedBankStatement` — or
 * `null` when the bank is unknown OR the parser produced zero rows
 * (which means the layout didn't match our heuristics and the UI
 * should fall back to the raw extracted text).
 */

import { detectBank } from "./detect-bank";
import { parseHdfcStatement } from "./hdfc";
import { parseIciciStatement } from "./icici";
import { parseBill, type ParsedBill } from "./bill";
import { parseReceipt, type ParsedReceipt } from "./receipt";
import type { ParsedBankStatement } from "./bank-statement-types";

export type { ParsedBankStatement, BankTransactionRow } from "./bank-statement-types";
export { parseBill, isParsedBill, type ParsedBill, type ParsedBillLineItem } from "./bill";
export { parseReceipt, isParsedReceipt, type ParsedReceipt } from "./receipt";

export function parseBankStatement(
  text: string | null | undefined
): ParsedBankStatement | null {
  if (!text) return null;
  const bank = detectBank(text);
  let result: ParsedBankStatement | null = null;
  try {
    switch (bank) {
      case "HDFC":
        result = parseHdfcStatement(text);
        break;
      case "ICICI":
        result = parseIciciStatement(text);
        break;
      case "AXIS":
      case "SBI":
      case "KOTAK":
      case "IDFC":
      case "UNKNOWN":
      default:
        // D2.4 adds Axis / SBI / Kotak / IDFC parsers. Until then we
        // surface bank: UNKNOWN with zero rows so the UI can still
        // show the bank name in the badge.
        result = null;
        break;
    }
  } catch (err) {
    console.warn(`[parse-bank-statement] ${bank} parser threw`, err);
    result = null;
  }

  // Treat zero-row results as null — the UI will show "couldn't
  // parse this layout" rather than an empty table.
  if (result && result.rows.length === 0) {
    return null;
  }
  return result;
}

/**
 * DOC-D2.3: Run the right parser for a given document type. Returns
 * the structured fields that go into `Document.extractedFields`.
 *
 * documentType comes from the classifier (BANK_STATEMENT / BILL /
 * INVOICE / RECEIPT / CONTRACT / UNKNOWN).
 */
export function parseByDocumentType(
  text: string | null | undefined,
  documentType: string | null | undefined
): ParsedBankStatement | ParsedBill | ParsedReceipt | null {
  if (!text) return null;
  try {
    switch (documentType) {
      case "BANK_STATEMENT":
        return parseBankStatement(text);
      case "BILL":
      case "INVOICE":
        return parseBill(text);
      case "RECEIPT":
        return parseReceipt(text);
      default:
        return null;
    }
  } catch (err) {
    console.warn(`[parseByDocumentType] ${documentType} parser threw`, err);
    return null;
  }
}
