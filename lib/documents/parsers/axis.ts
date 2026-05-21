/**
 * DOC-D2.4: Axis Bank statement parser.
 *
 * Axis e-statement layout is structurally close to HDFC's: date-led
 * rows, narration column, trailing Withdrawal / Deposit / Balance
 * columns. We delegate to the shared `parseGenericBankStatement`
 * with the bank tag set so this file is intentionally thin —
 * Axis-specific tweaks (when needed) land here.
 */

import { parseGenericBankStatement } from "./generic-bank";
import type { ParsedBankStatement } from "./bank-statement-types";

export function parseAxisStatement(text: string): ParsedBankStatement {
  return parseGenericBankStatement(text, "AXIS");
}
