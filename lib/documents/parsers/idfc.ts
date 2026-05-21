/**
 * DOC-D2.4: IDFC FIRST Bank statement parser.
 *
 * IDFC FIRST e-statements share the date-led / trailing-amount shape
 * with HDFC + Axis. Delegates to the generic parser with bank=IDFC.
 */

import { parseGenericBankStatement } from "./generic-bank";
import type { ParsedBankStatement } from "./bank-statement-types";

export function parseIdfcStatement(text: string): ParsedBankStatement {
  return parseGenericBankStatement(text, "IDFC");
}
