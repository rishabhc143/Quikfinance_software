/**
 * DOC-D2.2: Detect which Indian bank produced a statement, given the
 * extracted text. Returns a canonical `BankStatementSource` so the
 * top-level entry point can route to the right parser.
 *
 * Strategy: check for unambiguous bank-name + header-row signatures
 * (each bank's statement has distinctive column headers). Falls back
 * to UNKNOWN when nothing matches — the entry point returns null and
 * the UI gracefully shows "couldn't read this layout".
 */

import type { BankStatementSource } from "./bank-statement-types";

type DetectionRule = {
  bank: BankStatementSource;
  /** Keywords that must appear (case-insensitive) to fire. Order
   *  doesn't matter; all must be present. Keep tight to avoid
   *  false-positives. */
  required: string[];
};

const RULES: DetectionRule[] = [
  {
    bank: "HDFC",
    required: ["HDFC BANK"],
  },
  {
    bank: "ICICI",
    required: ["ICICI"],
  },
  {
    bank: "AXIS",
    required: ["AXIS BANK"],
  },
  {
    bank: "SBI",
    required: ["State Bank of India"],
  },
  {
    bank: "KOTAK",
    required: ["Kotak"],
  },
  {
    bank: "IDFC",
    required: ["IDFC"],
  },
];

/**
 * Pick the bank source for the given extracted text. Returns UNKNOWN
 * when no rule fires.
 */
export function detectBank(text: string | null | undefined): BankStatementSource {
  if (!text) return "UNKNOWN";
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    const allMatch = rule.required.every((k) =>
      lower.includes(k.toLowerCase())
    );
    if (allMatch) return rule.bank;
  }
  return "UNKNOWN";
}
