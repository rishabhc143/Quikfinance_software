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
import type { ParsedBankStatement } from "./bank-statement-types";

export type { ParsedBankStatement, BankTransactionRow } from "./bank-statement-types";

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
