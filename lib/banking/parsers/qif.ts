import { parseImportDate } from "@/lib/purchases/import-helpers";
import type { ParsedRow, RowError } from "@/lib/banking/csv-import";

/**
 * BNK-G — QIF parser.
 *
 * QIF is a line-prefix text format. Each transaction is a block of
 * lines, each starting with a single uppercase letter that names the
 * field, ending with a `^` line:
 *
 *   !Type:Bank          ← file header
 *   D04/15/2026         ← date
 *   T-2400.00           ← amount (signed; negative = withdrawal)
 *   N12345              ← reference / check number
 *   PAWS Cloud Services ← payee
 *   MMonthly subscription ← memo (description, may span more)
 *   ^                   ← end of transaction
 *
 * We treat `P` as the canonical description (fall back to `M` if
 * missing). Negative `T` → DEBIT, positive → CREDIT. Investment QIF
 * files (`!Type:Invst`) are out of scope — they have a different
 * field set and we'd need a separate parser path.
 */

export type StatementParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
  currency?: string;
};

const SUPPORTED_TYPES = new Set([
  "Bank",
  "Cash",
  "CCard",
  "Oth A",
  "Oth L",
]);

export function parseQif(text: string): StatementParseResult {
  const out: StatementParseResult = { rows: [], errors: [] };

  const normalised = text.replace(/\r\n?/g, "\n");
  const lines = normalised.split("\n");

  // Header line — !Type:<...>. If missing or unsupported, return as a
  // single global error rather than per-row noise.
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) {
    out.errors.push({ rowNumber: 1, message: "Empty QIF file" });
    return out;
  }
  const headerMatch = /^!Type:(.+)$/.exec(lines[i].trim());
  if (!headerMatch) {
    out.errors.push({
      rowNumber: 1,
      message: "Missing or malformed !Type header (expected !Type:Bank, !Type:CCard, etc.)",
    });
    return out;
  }
  const accountType = headerMatch[1].trim();
  if (!SUPPORTED_TYPES.has(accountType)) {
    out.errors.push({
      rowNumber: 1,
      message: `Unsupported QIF account type "${accountType}". Investment QIFs aren't supported.`,
    });
    return out;
  }
  i++;

  // Walk blocks. One transaction per ^-terminated block.
  let block: { code: string; value: string; lineNumber: number }[] = [];
  let blockStartLine = i + 1;
  let txnCount = 0;

  const flush = () => {
    if (block.length === 0) return;
    txnCount += 1;
    const parsed = parseBlock(block, blockStartLine);
    if ("error" in parsed) {
      out.errors.push({ rowNumber: blockStartLine, message: parsed.error });
    } else {
      out.rows.push(parsed);
    }
    block = [];
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === "") continue;
    if (line === "^") {
      flush();
      blockStartLine = i + 2;
      continue;
    }
    // Field line: first char is the code, rest is the value.
    if (block.length === 0) blockStartLine = i + 1;
    const code = raw.charAt(0);
    const value = raw.slice(1).trim();
    block.push({ code, value, lineNumber: i + 1 });
  }
  // Trailing block without ^ (some banks omit the final ^).
  flush();

  if (txnCount === 0) {
    out.errors.push({ rowNumber: 1, message: "No transactions found in the QIF file" });
  }

  return out;
}

function parseBlock(
  block: { code: string; value: string; lineNumber: number }[],
  blockStart: number
): ParsedRow | { error: string } {
  let dateRaw: string | null = null;
  let amountRaw: string | null = null;
  let payee: string | null = null;
  let memo: string | null = null;
  let reference: string | null = null;

  for (const field of block) {
    switch (field.code) {
      case "D":
        dateRaw = field.value;
        break;
      case "T":
      case "U":
        amountRaw = field.value;
        break;
      case "P":
        payee = field.value;
        break;
      case "M":
        memo = field.value;
        break;
      case "N":
        reference = field.value;
        break;
      // C (cleared), L (category), S (split category), A (address) —
      // ignored for v1.
    }
  }

  if (!dateRaw) return { error: `block at line ${blockStart}: missing D (date)` };
  const date = parseImportDate(dateRaw);
  if (!date) return { error: `block at line ${blockStart}: date "${dateRaw}" not recognised` };

  if (!amountRaw) return { error: `block at line ${blockStart}: missing T (amount)` };
  // Strip thousands separators + currency markers — QIF lets these slip in.
  const cleanedAmt = amountRaw.replace(/[,₹$£€\s]/g, "");
  const n = Number(cleanedAmt);
  if (!Number.isFinite(n)) {
    return { error: `block at line ${blockStart}: amount "${amountRaw}" not a number` };
  }
  const type = n < 0 ? "DEBIT" : "CREDIT";

  return {
    date,
    description: (payee ?? memo)?.trim() || null,
    reference: reference?.trim() || null,
    amount: Math.abs(n),
    type,
  };
}
