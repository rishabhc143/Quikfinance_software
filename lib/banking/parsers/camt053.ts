import { XMLParser } from "fast-xml-parser";
import type { ParsedRow, RowError } from "@/lib/banking/csv-import";

/**
 * BNK-G — CAMT.053 parser. ISO 20022 XML format used by SWIFT-affiliated
 * banks and growing in Europe / India for institutional statements.
 *
 * Walks `Document > BkToCstmrStmt > Stmt > Ntry[]`. Each `<Ntry>` is
 * one bank-line entry with:
 *
 *   - `<BookgDt><Dt>2026-04-15</Dt></BookgDt>` (booking date)
 *   - `<Amt Ccy="EUR">99.99</Amt>` (positive)
 *   - `<CdtDbtInd>DBIT</CdtDbtInd>` (CRDT or DBIT — the direction)
 *   - `<AcctSvcrRef>REF12345</AcctSvcrRef>` (service-provider reference)
 *   - `<NtryDtls><TxDtls><RmtInf><Ustrd>...</Ustrd>` (free-text remittance)
 *
 * Namespace prefixes are stripped (`removeNSPrefix: true`) so callers
 * don't need to know which version of camt.053 was used.
 */

export type StatementParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
  currency?: string;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  trimValues: true,
  removeNSPrefix: true,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function getText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("#text" in obj) return getText(obj["#text"]);
  }
  return null;
}

function getAttr(v: unknown, attr: string): string | null {
  if (typeof v !== "object" || v === null) return null;
  const key = `@_${attr}`;
  const obj = v as Record<string, unknown>;
  if (key in obj) return getText(obj[key]);
  return null;
}

/** Find a nested value by walking a dotted path (skips arrays — returns first). */
function pluck(node: unknown, path: string): unknown {
  let cur: unknown = node;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) cur = cur[0];
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function parseCamt053(text: string): StatementParseResult {
  const out: StatementParseResult = { rows: [], errors: [] };

  if (!text || text.trim() === "") {
    out.errors.push({ rowNumber: 0, message: "Empty CAMT.053 file" });
    return out;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(text) as Record<string, unknown>;
  } catch (e) {
    out.errors.push({
      rowNumber: 0,
      message: `CAMT.053 parse failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return out;
  }

  const doc = parsed["Document"] as Record<string, unknown> | undefined;
  if (!doc) {
    out.errors.push({
      rowNumber: 0,
      message: "Missing <Document> root (is this a CAMT.053 file?)",
    });
    return out;
  }

  const bkToCstmrStmt = doc["BkToCstmrStmt"] as Record<string, unknown> | undefined;
  if (!bkToCstmrStmt) {
    out.errors.push({
      rowNumber: 0,
      message: "Missing <BkToCstmrStmt> (not a CAMT.053 statement)",
    });
    return out;
  }

  // Multiple Stmts in one file → take the first, warn the user.
  const stmts = asArray(bkToCstmrStmt["Stmt"]);
  if (stmts.length === 0) {
    out.errors.push({ rowNumber: 0, message: "No <Stmt> blocks in file" });
    return out;
  }
  if (stmts.length > 1) {
    out.errors.push({
      rowNumber: 0,
      message: `Multiple <Stmt> blocks (${stmts.length}). v1 only reads the first.`,
    });
  }
  const stmt = stmts[0] as Record<string, unknown>;

  // Currency comes from the account block or the first entry's amount Ccy.
  const acctCcy = getText(pluck(stmt, "Acct.Ccy"));
  if (acctCcy) out.currency = acctCcy;

  const entries = asArray(stmt["Ntry"]);
  if (entries.length === 0) {
    out.errors.push({ rowNumber: 0, message: "No <Ntry> entries in <Stmt>" });
    return out;
  }

  entries.forEach((rawEntry, i) => {
    if (typeof rawEntry !== "object" || rawEntry === null) {
      out.errors.push({ rowNumber: i + 1, message: "Skipped malformed <Ntry>" });
      return;
    }
    const ntry = rawEntry as Record<string, unknown>;

    // Date — prefer booking date, fall back to value date.
    const dateRaw =
      getText(pluck(ntry, "BookgDt.Dt")) ??
      getText(pluck(ntry, "ValDt.Dt")) ??
      getText(pluck(ntry, "BookgDt.DtTm")) ??
      getText(pluck(ntry, "ValDt.DtTm"));
    if (!dateRaw) {
      out.errors.push({
        rowNumber: i + 1,
        message: "Missing BookgDt / ValDt",
      });
      return;
    }
    const date = new Date(dateRaw);
    if (!Number.isFinite(date.getTime())) {
      out.errors.push({
        rowNumber: i + 1,
        message: `Date "${dateRaw}" not recognised`,
      });
      return;
    }

    // Amount + currency on the amount node.
    const amtNode = ntry["Amt"];
    const amtText = getText(amtNode);
    if (!amtText) {
      out.errors.push({ rowNumber: i + 1, message: "Missing <Amt>" });
      return;
    }
    const amount = Number(amtText);
    if (!Number.isFinite(amount)) {
      out.errors.push({
        rowNumber: i + 1,
        message: `Amount "${amtText}" not a number`,
      });
      return;
    }
    // Per-entry currency — used only to set out.currency if account-level was missing.
    const entryCcy = getAttr(amtNode, "Ccy");
    if (!out.currency && entryCcy) out.currency = entryCcy;

    // Direction.
    const cdInd = getText(ntry["CdtDbtInd"]);
    if (cdInd !== "CRDT" && cdInd !== "DBIT") {
      out.errors.push({
        rowNumber: i + 1,
        message: `CdtDbtInd "${cdInd}" — expected CRDT or DBIT`,
      });
      return;
    }
    const type = cdInd === "CRDT" ? "CREDIT" : "DEBIT";

    // Reference — service-provider ref first, then end-to-end id from
    // remittance details.
    const reference =
      getText(ntry["AcctSvcrRef"]) ??
      getText(pluck(ntry, "NtryDtls.TxDtls.Refs.EndToEndId")) ??
      null;

    // Description — pulled from the remittance info (free text) or
    // additional info on the entry. Multiple Ustrd lines are
    // concatenated.
    const ustrd = asArray(
      pluck(ntry, "NtryDtls.TxDtls.RmtInf.Ustrd") as
        | string
        | string[]
        | undefined
    )
      .map((s) => (typeof s === "string" ? s : getText(s)))
      .filter((s): s is string => !!s)
      .join(" · ");
    const addtlNtryInf = getText(ntry["AddtlNtryInf"]);
    const description = ustrd.trim() || addtlNtryInf || null;

    out.rows.push({
      date,
      description,
      reference,
      amount: Math.abs(amount),
      type,
    });
  });

  return out;
}
