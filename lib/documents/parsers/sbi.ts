/**
 * DOC-D2.4: State Bank of India statement parser.
 *
 * SBI's CSV / PDF export uses `dd-MM-yyyy` dates and a 6-column
 * layout: Txn Date / Value Date / Description / Ref No / Debit /
 * Credit / Balance. The generic parser handles dd-MM-yyyy date
 * detection + trailing-amount extraction, so this stays thin.
 */

import { parseGenericBankStatement } from "./generic-bank";
import type { ParsedBankStatement } from "./bank-statement-types";

export function parseSbiStatement(text: string): ParsedBankStatement {
  return parseGenericBankStatement(text, "SBI");
}
