import { XMLParser } from "fast-xml-parser";
import type { ParsedRow, RowError } from "@/lib/banking/csv-import";

/**
 * BNK-G — OFX parser. Handles both OFX 1.x (SGML, the most common
 * legacy export format) and OFX 2.x (XML).
 *
 * The trick for OFX 1.x: leaf tags are unclosed, so the file isn't
 * valid XML out of the box. We strip the header preamble, then run a
 * regex pass that closes `<TAG>value` into `<TAG>value</TAG>` (only
 * for lines where the next line is a new opening tag or a parent
 * close). After that, `fast-xml-parser` does the rest.
 *
 * Returns the canonical `ParsedRow[]` shape:
 *   - description ← <NAME>, fall back to <MEMO>
 *   - reference   ← <FITID> (genuinely unique per bank — great for dedup)
 *   - date        ← <DTPOSTED> (parsed as YYYYMMDD or full timestamp)
 *   - amount      ← abs(<TRNAMT>)
 *   - type        ← <TRNAMT> sign (negative = DEBIT)
 */

export type StatementParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
  currency?: string;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false, // defense against XXE
  trimValues: true,
});

/** Parse OFX YYYYMMDD or YYYYMMDDhhmmss[.xxx][TZ] into a JS Date. */
function parseOfxDate(raw: string): Date | null {
  if (!raw) return null;
  // Strip optional [...] timezone block: "20260415000000.000[5:EST]"
  const stripped = raw.replace(/\[[^\]]*\]/, "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/.exec(stripped);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  const date = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss)
    )
  );
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Strip the OFX 1.x SGML header (lines before the first `<` block). */
function stripOfx1Header(text: string): string {
  const xmlStart = text.indexOf("<");
  if (xmlStart < 0) return text;
  return text.slice(xmlStart);
}

/**
 * Convert OFX 1.x SGML body to valid XML by closing leaf tags.
 *
 * The shape is:
 *   <TAG>value
 *   <NEXTTAG>...
 * vs
 *   <PARENT>
 *     <CHILD>...
 *   </PARENT>
 *
 * For each line of the form `^\s*<TAG>value$` (where `value` is not
 * empty and doesn't start with `<`), insert a closing `</TAG>` at the
 * end. Already-XML (OFX 2.x) flows through unchanged.
 */
function normaliseOfx1ToXml(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(\s*)<([A-Z0-9.]+)>(.+?)\s*$/.exec(line);
      if (!m) return line;
      const [, indent, tag, value] = m;
      // Skip if the value starts with another `<` (already an XML
      // parent element) or is already a closing tag form.
      if (value.startsWith("<")) return line;
      return `${indent}<${tag}>${value}</${tag}>`;
    })
    .join("\n");
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function getText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  return null;
}

export function parseOfx(text: string): StatementParseResult {
  const out: StatementParseResult = { rows: [], errors: [] };

  if (!text || text.trim() === "") {
    out.errors.push({ rowNumber: 0, message: "Empty OFX file" });
    return out;
  }

  // Detect OFX 2.x (XML) vs OFX 1.x (SGML) by looking for an XML declaration.
  const isXml = /^\s*<\?xml/i.test(text);
  const body = isXml ? text : normaliseOfx1ToXml(stripOfx1Header(text));

  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(body) as Record<string, unknown>;
  } catch (e) {
    out.errors.push({
      rowNumber: 0,
      message: `OFX parse failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return out;
  }

  // Walk to BANKTRANLIST. Path:
  //   OFX > BANKMSGSRSV1 > STMTTRNRS > STMTRS > BANKTRANLIST > STMTTRN[]
  // (For credit cards: OFX > CREDITCARDMSGSRSV1 > CCSTMTTRNRS > CCSTMTRS > ...)
  const ofx =
    (parsed["OFX"] as Record<string, unknown> | undefined) ??
    (parsed["ofx"] as Record<string, unknown> | undefined);
  if (!ofx) {
    out.errors.push({ rowNumber: 0, message: "Missing <OFX> root" });
    return out;
  }

  const stmtRs = findStatementResponse(ofx);
  if (!stmtRs) {
    out.errors.push({
      rowNumber: 0,
      message: "No <STMTRS> or <CCSTMTRS> statement block found",
    });
    return out;
  }

  // Currency — used by the import action to verify against BankAccount.
  const curdef = getText(stmtRs["CURDEF"]);
  if (curdef) out.currency = curdef;

  // Refuse multi-account OFX files for v1.
  const multiStmt = countMultiStmt(ofx);
  if (multiStmt > 1) {
    out.errors.push({
      rowNumber: 0,
      message: `OFX file contains ${multiStmt} statement blocks. v1 only supports single-account files — please split your export.`,
    });
    return out;
  }

  const tranList = stmtRs["BANKTRANLIST"] as Record<string, unknown> | undefined;
  if (!tranList) {
    out.errors.push({ rowNumber: 0, message: "Missing <BANKTRANLIST>" });
    return out;
  }

  const txns = asArray(tranList["STMTTRN"] as unknown);
  txns.forEach((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      out.errors.push({
        rowNumber: i + 1,
        message: "Skipped malformed <STMTTRN>",
      });
      return;
    }
    const txn = raw as Record<string, unknown>;

    const dateRaw = getText(txn["DTPOSTED"]) ?? getText(txn["DTUSER"]);
    if (!dateRaw) {
      out.errors.push({ rowNumber: i + 1, message: "Missing DTPOSTED" });
      return;
    }
    const date = parseOfxDate(dateRaw);
    if (!date) {
      out.errors.push({
        rowNumber: i + 1,
        message: `DTPOSTED "${dateRaw}" not recognised`,
      });
      return;
    }

    const amtRaw = getText(txn["TRNAMT"]);
    if (!amtRaw) {
      out.errors.push({ rowNumber: i + 1, message: "Missing TRNAMT" });
      return;
    }
    const amount = Number(amtRaw);
    if (!Number.isFinite(amount)) {
      out.errors.push({
        rowNumber: i + 1,
        message: `TRNAMT "${amtRaw}" not a number`,
      });
      return;
    }

    const fitid = getText(txn["FITID"]);
    const name = getText(txn["NAME"]);
    const memo = getText(txn["MEMO"]);
    const checkNum = getText(txn["CHECKNUM"]);

    out.rows.push({
      date,
      description: name || memo || null,
      reference: fitid || checkNum || null,
      amount: Math.abs(amount),
      type: amount < 0 ? "DEBIT" : "CREDIT",
    });
  });

  if (out.rows.length === 0 && out.errors.length === 0) {
    out.errors.push({ rowNumber: 0, message: "No transactions found in OFX file" });
  }

  return out;
}

/** Locate the statement-response block (bank or credit card). */
function findStatementResponse(
  ofx: Record<string, unknown>
): Record<string, unknown> | null {
  const bank = ofx["BANKMSGSRSV1"] as Record<string, unknown> | undefined;
  if (bank) {
    const stmtTrnRs = bank["STMTTRNRS"] as Record<string, unknown> | undefined;
    const stmtRs = stmtTrnRs?.["STMTRS"] as Record<string, unknown> | undefined;
    if (stmtRs) return stmtRs;
  }
  const cc = ofx["CREDITCARDMSGSRSV1"] as Record<string, unknown> | undefined;
  if (cc) {
    const ccStmtTrnRs = cc["CCSTMTTRNRS"] as Record<string, unknown> | undefined;
    const ccStmtRs = ccStmtTrnRs?.["CCSTMTRS"] as Record<string, unknown> | undefined;
    if (ccStmtRs) return ccStmtRs;
  }
  return null;
}

function countMultiStmt(ofx: Record<string, unknown>): number {
  let count = 0;
  const bank = ofx["BANKMSGSRSV1"] as Record<string, unknown> | undefined;
  if (bank) {
    const stmtTrnRs = asArray(bank["STMTTRNRS"]);
    for (const x of stmtTrnRs) {
      if (x && typeof x === "object" && "STMTRS" in (x as object)) count += 1;
    }
  }
  const cc = ofx["CREDITCARDMSGSRSV1"] as Record<string, unknown> | undefined;
  if (cc) {
    const ccStmtTrnRs = asArray(cc["CCSTMTTRNRS"]);
    for (const x of ccStmtTrnRs) {
      if (x && typeof x === "object" && "CCSTMTRS" in (x as object)) count += 1;
    }
  }
  return count;
}
