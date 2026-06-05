import "server-only";

/**
 * Tally Prime XML parser.
 *
 * Targets the standard XML emitted by Tally Prime via
 *   Gateway → Display → Day Book → Alt+E (Export) → Format: XML
 *
 * Schema is documented at https://help.tallysolutions.com (search
 * "XML format"). It hasn't changed materially between Tally Prime
 * 2.x → 4.x; legacy Tally ERP 9 / Tally 9 emit nearly the same
 * shape with a few field renames (handled by sibling parsers in
 * Phase 2 — not in v1).
 *
 * The full envelope looks like:
 *
 *   <ENVELOPE>
 *     <HEADER>...</HEADER>
 *     <BODY>
 *       <IMPORTDATA>
 *         <REQUESTDATA>
 *           <TALLYMESSAGE>
 *             <LEDGER NAME="Acme Corp">
 *               <PARENT>Sundry Debtors</PARENT>
 *               <PARTYGSTIN>...</PARTYGSTIN>
 *               <OPENINGBALANCE>-150000.00</OPENINGBALANCE>
 *               ...
 *             </LEDGER>
 *           </TALLYMESSAGE>
 *           <TALLYMESSAGE>
 *             <VOUCHER VCHTYPE="Sales" ACTION="Create">
 *               <DATE>20240515</DATE>
 *               <VOUCHERNUMBER>INV-001</VOUCHERNUMBER>
 *               <PARTYLEDGERNAME>Acme Corp</PARTYLEDGERNAME>
 *               <ALLINVENTORYENTRIES.LIST>...</ALLINVENTORYENTRIES.LIST>
 *               <LEDGERENTRIES.LIST>...</LEDGERENTRIES.LIST>
 *             </VOUCHER>
 *           </TALLYMESSAGE>
 *         </REQUESTDATA>
 *       </IMPORTDATA>
 *     </BODY>
 *   </ENVELOPE>
 *
 * v1 scope:
 *   - LEDGER masters (Customer, Vendor, Bank, P&L, BS accounts)
 *   - VOUCHER of VCHTYPE "Sales"
 *
 * v2 will add Purchase, Receipt, Payment, Journal, Credit/Debit
 * Note, Contra. The parsing infrastructure (group classifier,
 * ledger-entries summer, GST detector) is set up to be re-used.
 */

import { XMLParser } from "fast-xml-parser";
import type {
  CanonicalLedger,
  CanonicalLedgerKind,
  CanonicalLine,
  CanonicalVoucher,
  FormatParser,
  ParseResult,
  ParseWarning,
} from "../canonical";

const SOURCE_FORMAT = "tally-prime" as const;

// fast-xml-parser configuration. Tally XML peculiarities:
//   - Most attributes are uppercase (NAME, VCHTYPE, ACTION).
//   - Many nodes can appear once or N times depending on data
//     (e.g. <ALLINVENTORYENTRIES.LIST>). We tell the parser to
//     always wrap these as arrays via `isArray`.
//   - Tally uses `&#4;` (EOT) as a placeholder for missing values.
//     The parser handles standard XML entities natively.
//   - Numbers are strings ("150000.00"); we parse them as floats
//     ourselves to keep precision controlled.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  // Force certain known-repeatable nodes to always be arrays even
  // when only one exists. Prevents the "single child vs array of
  // children" branching all over the mapping code.
  isArray: (name) => {
    return (
      name === "TALLYMESSAGE" ||
      name === "ALLINVENTORYENTRIES.LIST" ||
      name === "ALLLEDGERENTRIES.LIST" ||
      name === "LEDGERENTRIES.LIST" ||
      name === "BATCHALLOCATIONS.LIST" ||
      name === "BANKALLOCATIONS.LIST"
    );
  },
});

/** Always coerce a Tally numeric string to a finite JS number.
 *  Tally formats:
 *    "10000.00"     → 10000
 *    "-10000.00"    → -10000  (credit-side amount)
 *    "10000.00 Dr"  → 10000   (with explicit Dr/Cr suffix; rare)
 *    ""             → 0
 *    undefined      → 0  */
function toNum(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Tally sometimes appends " Dr" or " Cr" — strip both.
  const cleaned = s.replace(/\s*(dr|cr)$/i, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Tally dates are yyyyMMdd. Convert to ISO yyyy-MM-dd for the
 *  canonical record. Returns the original string if it doesn't
 *  match the expected shape (mapper will treat as today's date
 *  with a warning). */
function tallyDateToIso(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

/** Tally allows a single text-content child or an object with
 *  attributes + content. Normalise to the plain text. */
function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    if ("#text" in obj) return String(obj["#text"] ?? "").trim();
  }
  return String(node).trim();
}

/** Classify a Tally ledger by its parent group. Tally's group
 *  hierarchy is well-known: Sundry Debtors, Sundry Creditors,
 *  Bank Accounts, Cash-in-Hand, Sales Accounts, Purchase Accounts,
 *  Direct/Indirect Expenses, Direct/Indirect Incomes, etc.
 *
 *  Heuristic: match the group path (case-insensitive) against
 *  known patterns. Anything we can't classify becomes "other"
 *  with a warning so the user can re-map post-import. */
function classifyLedger(group: string): CanonicalLedgerKind {
  const g = group.toLowerCase();
  if (g.includes("sundry debt")) return "customer";
  if (g.includes("sundry cred")) return "vendor";
  if (g.includes("bank") || g.includes("cash-in-hand") || g.includes("cash in hand")) return "bank";
  // P&L side
  if (g.includes("sales account") || g.includes("indirect income") || g.includes("direct income")) {
    return "income";
  }
  if (
    g.includes("purchase account") ||
    g.includes("indirect expense") ||
    g.includes("direct expense") ||
    g.includes("expenses")
  ) {
    return "expense";
  }
  // GST / TDS / TCS ledgers
  if (g.includes("duties & taxes") || g.includes("duties and taxes")) return "tax";
  // Balance sheet
  if (
    g.includes("current liabilit") ||
    g.includes("loan") ||
    g.includes("provision") ||
    g.includes("capital") ||
    g.includes("reserves")
  ) {
    return "liability";
  }
  if (
    g.includes("current asset") ||
    g.includes("fixed asset") ||
    g.includes("investment") ||
    g.includes("deposit") ||
    g.includes("loans & advances") ||
    g.includes("loans and advances")
  ) {
    return "asset";
  }
  return "other";
}

/** Parse one <LEDGER> node into a CanonicalLedger. */
function parseLedger(
  node: Record<string, unknown>,
  warnings: ParseWarning[]
): CanonicalLedger | null {
  const name = String(node["@_NAME"] ?? "").trim();
  if (!name) {
    warnings.push({ code: "ledger_missing_name", message: "Ledger element with no NAME attribute — skipped." });
    return null;
  }

  const parent = textOf(node["PARENT"]);
  const kind = classifyLedger(parent);
  if (kind === "other") {
    warnings.push({
      code: "ledger_group_unmapped",
      message: `Ledger "${name}" under group "${parent}" couldn't be classified — stored as 'other'. You can re-map post-import.`,
    });
  }

  // GSTIN can live in either PARTYGSTIN (Tally Prime) or
  // GSTREGISTRATIONNUMBER (some Tally ERP 9 exports). Check both.
  const gstin =
    textOf(node["PARTYGSTIN"]) ||
    textOf(node["GSTREGISTRATIONNUMBER"]) ||
    undefined;

  // State name lives under STATEDETAILS.LIST > STATENAME on Tally
  // Prime, or LEDSTATENAME on older exports.
  let stateCode: string | undefined;
  const stateDetailsRaw = node["STATEDETAILS.LIST"];
  if (stateDetailsRaw && typeof stateDetailsRaw === "object") {
    const sd = stateDetailsRaw as Record<string, unknown>;
    stateCode = textOf(sd["STATENAME"]) || undefined;
  }
  if (!stateCode) stateCode = textOf(node["LEDSTATENAME"]) || undefined;

  const address =
    textOf(node["ADDRESS"]) ||
    textOf(node["MAILINGNAME"]) ||
    textOf(node["LEDMAILINGNAME"]) ||
    undefined;

  const phone =
    textOf(node["LEDGERPHONE"]) ||
    textOf(node["LEDPHONE"]) ||
    textOf(node["LEDGERMOBILE"]) ||
    undefined;

  const email = textOf(node["EMAIL"]) || textOf(node["LEDGEREMAIL"]) || undefined;

  // OPENINGBALANCE: negative = credit, positive = debit in Tally
  // convention. We keep the sign as-is; mapper interprets it.
  const openingBalanceRaw = node["OPENINGBALANCE"];
  const openingBalance = openingBalanceRaw != null ? toNum(openingBalanceRaw) : undefined;

  // Tally's idempotency: ledgers don't have stable GUIDs in
  // exports the way vouchers do (vouchers have GUID field). For
  // ledgers we use the lowercased, trimmed name as the source key.
  // Collisions are impossible inside one Tally company (Tally
  // itself enforces unique ledger names).
  const sourceGuid = `ledger:${name.toLowerCase()}`;

  return {
    sourceFormat: SOURCE_FORMAT,
    sourceGuid,
    displayName: name,
    kind,
    groupPath: parent || undefined,
    gstin,
    stateCode,
    address,
    phone,
    email,
    openingBalance,
    raw: node,
  };
}

/** Parse one <VOUCHER> node of VCHTYPE=Sales. */
function parseSalesVoucher(
  node: Record<string, unknown>,
  warnings: ParseWarning[]
): CanonicalVoucher | null {
  const guid = textOf(node["GUID"]);
  const voucherNumber = textOf(node["VOUCHERNUMBER"]);
  const dateIso = tallyDateToIso(textOf(node["DATE"]));
  const partyName = textOf(node["PARTYLEDGERNAME"]) || textOf(node["PARTYNAME"]);
  const partyGstin = textOf(node["PARTYGSTIN"]) || undefined;
  const placeOfSupply = textOf(node["PLACEOFSUPPLY"]) || textOf(node["STATENAME"]) || undefined;
  const narration = textOf(node["NARRATION"]) || undefined;

  if (!guid && !voucherNumber) {
    warnings.push({
      code: "voucher_no_identity",
      message: "Sales voucher has no GUID or VOUCHERNUMBER — skipped.",
    });
    return null;
  }

  // Use GUID as primary identity; fall back to voucher-number when
  // older exports omit the GUID field.
  const sourceGuid = guid || `vch:sales:${voucherNumber}:${dateIso}`;

  // Lines: ALLINVENTORYENTRIES.LIST for item lines, plus
  // LEDGERENTRIES.LIST for the ledger-side bookkeeping. We model
  // the inventory lines as CanonicalLine (the user-facing line
  // items) and stash the ledger entries in `raw` for the reconci-
  // liation report.
  const inventoryEntries =
    (node["ALLINVENTORYENTRIES.LIST"] as Record<string, unknown>[] | undefined) ?? [];
  const lines: CanonicalLine[] = [];

  for (const entry of inventoryEntries) {
    const itemName = textOf(entry["STOCKITEMNAME"]) || undefined;
    const hsn = textOf(entry["GSTHSNNAME"]) || textOf(entry["HSNCODE"]) || undefined;
    const rate = entry["RATE"] != null ? toNum(entry["RATE"]) : undefined;
    const quantityRaw = textOf(entry["BILLEDQTY"]) || textOf(entry["ACTUALQTY"]);
    // Tally writes qty as "10 nos" or just "10". Extract the leading number.
    const quantity = quantityRaw ? toNum(quantityRaw.split(" ")[0]) : undefined;
    const amount = toNum(entry["AMOUNT"]);

    // Tax info is embedded in the sub-LEDGERENTRIES under each
    // inventory entry. We sum CGST + SGST + IGST cents on this line.
    let taxAmount = 0;
    const subLedgerEntries =
      (entry["LEDGERENTRIES.LIST"] as Record<string, unknown>[] | undefined) ?? [];
    for (const subL of subLedgerEntries) {
      const ledName = textOf(subL["LEDGERNAME"]).toLowerCase();
      if (
        ledName.includes("cgst") ||
        ledName.includes("sgst") ||
        ledName.includes("igst") ||
        ledName.includes("cess")
      ) {
        // Tally signs taxes negative on Sales (it's a credit). Take
        // absolute value for the canonical line's tax amount.
        taxAmount += Math.abs(toNum(subL["AMOUNT"]));
      }
    }
    const taxRate = amount > 0 && taxAmount > 0 ? +((taxAmount / amount) * 100).toFixed(2) : undefined;

    lines.push({
      itemName,
      hsn,
      rate,
      quantity,
      amount,
      taxRate,
      taxAmount: taxAmount > 0 ? taxAmount : undefined,
      raw: entry,
    });
  }

  if (lines.length === 0) {
    // Service-only invoice with no inventory entries — derive a
    // single line from the LEDGERENTRIES (typical for accounting
    // firms / consultants).
    const ledgerEntries =
      (node["ALLLEDGERENTRIES.LIST"] as Record<string, unknown>[] | undefined) ??
      (node["LEDGERENTRIES.LIST"] as Record<string, unknown>[] | undefined) ??
      [];
    const incomeLines = ledgerEntries.filter((le) => {
      const ledName = textOf(le["LEDGERNAME"]).toLowerCase();
      return !ledName.includes("gst") && !ledName.includes("tcs") && !ledName.includes("tds") && ledName !== partyName.toLowerCase();
    });
    for (const le of incomeLines) {
      lines.push({
        itemName: textOf(le["LEDGERNAME"]) || undefined,
        amount: Math.abs(toNum(le["AMOUNT"])),
        ledgerRef: textOf(le["LEDGERNAME"]) || undefined,
        raw: le,
      });
    }
  }

  // Voucher totals — Tally records the party-side amount as a
  // single LEDGERENTRIES line; that's the gross total. Falling
  // back to line-sum when not present.
  const allLedgerEntries =
    (node["ALLLEDGERENTRIES.LIST"] as Record<string, unknown>[] | undefined) ??
    (node["LEDGERENTRIES.LIST"] as Record<string, unknown>[] | undefined) ??
    [];
  let gross = 0;
  for (const le of allLedgerEntries) {
    const ledName = textOf(le["LEDGERNAME"]).toLowerCase();
    if (ledName === partyName.toLowerCase()) {
      gross = Math.abs(toNum(le["AMOUNT"]));
      break;
    }
  }
  if (gross === 0) {
    gross = lines.reduce((s, l) => s + l.amount + (l.taxAmount ?? 0), 0);
  }
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);

  const result: CanonicalVoucher = {
    sourceFormat: SOURCE_FORMAT,
    sourceGuid,
    sourceVoucherNumber: voucherNumber,
    type: "sales",
    date: dateIso,
    placeOfSupply,
    lines,
    narration,
    totals: {
      subtotal,
      tax,
      total: gross || subtotal + tax,
    },
    raw: node,
  };
  if (partyName) {
    result.partyRef = {
      sourceGuid: `ledger:${partyName.toLowerCase()}`,
      displayName: partyName,
      gstin: partyGstin,
    };
  } else {
    warnings.push({
      code: "voucher_missing_party",
      message: `Sales voucher ${voucherNumber} has no PARTYLEDGERNAME — preserved without party link.`,
      sourceGuid,
    });
  }
  return result;
}

export const tallyPrimeParser: FormatParser = {
  detect(sample) {
    // Quick fingerprint — Tally Prime exports begin with the
    // standard envelope; we look for distinctive markers in the
    // first few KB.
    return (
      sample.includes("<ENVELOPE>") &&
      (sample.includes("<TALLYMESSAGE") || sample.includes("VCHTYPE="))
    );
  },

  async parse(xml: string): Promise<ParseResult> {
    const warnings: ParseWarning[] = [];
    const ledgers: CanonicalLedger[] = [];
    const vouchers: CanonicalVoucher[] = [];

    let parsed: Record<string, unknown>;
    try {
      parsed = xmlParser.parse(xml) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `Could not parse Tally XML: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }

    // Walk: ENVELOPE > BODY > IMPORTDATA > REQUESTDATA >
    // TALLYMESSAGE[]
    const envelope = (parsed["ENVELOPE"] as Record<string, unknown> | undefined) ?? {};
    const body = (envelope["BODY"] as Record<string, unknown> | undefined) ?? {};
    const importData = (body["IMPORTDATA"] as Record<string, unknown> | undefined) ?? {};
    const requestData = (importData["REQUESTDATA"] as Record<string, unknown> | undefined) ?? {};
    const tallyMessages =
      (requestData["TALLYMESSAGE"] as Record<string, unknown>[] | undefined) ?? [];

    if (tallyMessages.length === 0) {
      // Some exports nest TALLYMESSAGE directly under BODY (older
      // Tally). Try that fallback before declaring the file empty.
      const altMessages = (body["TALLYMESSAGE"] as Record<string, unknown>[] | undefined) ?? [];
      if (altMessages.length === 0) {
        warnings.push({
          code: "empty_envelope",
          message: "No <TALLYMESSAGE> elements found. Was the file fully exported from Tally?",
        });
        return { sourceFormat: SOURCE_FORMAT, ledgers, vouchers, warnings };
      }
      tallyMessages.push(...altMessages);
    }

    for (const msg of tallyMessages) {
      // A TALLYMESSAGE can contain LEDGER, VOUCHER, STOCKITEM, etc.
      // Process each that we recognize; warn on unknowns.
      if (msg["LEDGER"]) {
        const ledgerNodes = Array.isArray(msg["LEDGER"]) ? msg["LEDGER"] : [msg["LEDGER"]];
        for (const ln of ledgerNodes as Record<string, unknown>[]) {
          const led = parseLedger(ln, warnings);
          if (led) ledgers.push(led);
        }
      }
      if (msg["VOUCHER"]) {
        const voucherNodes = Array.isArray(msg["VOUCHER"]) ? msg["VOUCHER"] : [msg["VOUCHER"]];
        for (const vn of voucherNodes as Record<string, unknown>[]) {
          const vchType = String(vn["@_VCHTYPE"] ?? vn["VOUCHERTYPENAME"] ?? "").toLowerCase();
          if (vchType === "sales") {
            const vch = parseSalesVoucher(vn, warnings);
            if (vch) vouchers.push(vch);
          } else if (vchType) {
            // v1 only supports Sales. Track unsupported types so
            // the user knows what was skipped.
            warnings.push({
              code: "voucher_type_unsupported_v1",
              message: `Voucher type "${vchType}" not yet supported in Companion v1 — skipped (will be added in v2).`,
            });
          }
        }
      }
    }

    return { sourceFormat: SOURCE_FORMAT, ledgers, vouchers, warnings };
  },
};
