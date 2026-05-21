/**
 * DOC-D2.4: Kotak Mahindra Bank statement parser.
 *
 * Kotak e-statements use the same structural shape as HDFC (Date,
 * Description, Chq. No., Withdrawal, Deposit, Balance). Delegates to
 * the generic parser with bank=KOTAK.
 */

import { parseGenericBankStatement } from "./generic-bank";
import type { ParsedBankStatement } from "./bank-statement-types";

export function parseKotakStatement(text: string): ParsedBankStatement {
  return parseGenericBankStatement(text, "KOTAK");
}
