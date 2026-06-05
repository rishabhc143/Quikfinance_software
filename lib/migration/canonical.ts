/**
 * Tally Companion / Migration — canonical intermediate format.
 *
 * The whole pipeline is structured as:
 *
 *     File ── (per-format) Parser ──► Canonical* ──► Mapper ──► DB
 *                                       ▲
 *                                       │ All downstream code
 *                                       │ depends on THIS shape,
 *                                       │ not on Tally / Zoho / QB
 *                                       │ specifics.
 *
 * Why a canonical layer rather than parser-writes-prisma-directly:
 *
 *   1. Format variations isolated. Tally Prime, Tally ERP 9, Tally
 *      Cloud, and (later) Zoho XML / QB QBO all have different XML
 *      shapes. They each ship their own parser; downstream code
 *      doesn't change.
 *   2. Tests run on canonical fixtures, source-agnostic. We test the
 *      mapper once instead of N-format-times.
 *   3. Customizable schema tolerance — unknown fields land in
 *      `raw` rather than crashing.
 *   4. Version pinning — bumping the canonical version lets us
 *      migrate stored Companion data forward without rewriting
 *      every parser.
 *
 * v1 covers the 80% used by Indian SMBs: Customers, Vendors,
 * Sales vouchers, Purchase vouchers, Receipts, Payments. Stock
 * Items / Manufacturing / Cost Centers / Optional vouchers are
 * Phase-2 work and intentionally absent here.
 */

/** Distinguishes which file format produced this canonical record.
 *  Embedded in every row for audit + future migration. */
export type SourceFormat =
  | "tally-prime"
  | "tally-erp9"
  | "tally-9"
  | "zoho-xml"
  | "qb-qbo";

/** Coarse classification of a ledger / contact-like row from the
 *  source system. The mapper uses this + the Tally group path to
 *  decide which Companion table to write into. */
export type CanonicalLedgerKind =
  /** Sundry Debtors descendants — billable customers. */
  | "customer"
  /** Sundry Creditors descendants — vendors / suppliers. */
  | "vendor"
  /** Bank Accounts / Cash-in-Hand — bank-side ledgers. */
  | "bank"
  /** Income / Expense / Indirect Income / Direct Expense — P&L accounts. */
  | "income"
  | "expense"
  /** Capital / Reserves / Current Liabilities / Current Assets — balance-sheet accounts. */
  | "asset"
  | "liability"
  /** Tax ledgers (CGST, SGST, IGST, TDS, TCS, etc.) */
  | "tax"
  /** Anything we couldn't classify. Mapper persists these as
   *  generic accounts and surfaces them in the warnings report. */
  | "other";

export type CanonicalLedger = {
  /** Format that produced this row (e.g. "tally-prime"). */
  sourceFormat: SourceFormat;
  /** Stable identifier from the source. For Tally, the LANGUAGENAME
   *  / ALTERLEDGER inner GUID; for Zoho, the contact_id. Used for
   *  idempotent re-imports — uploading the same XML twice merges
   *  on this, doesn't double. */
  sourceGuid: string;
  /** Display name as Tally / source presents it. May contain Indian
   *  language characters; we preserve UTF-8 throughout. */
  displayName: string;
  /** Coarse classification. See CanonicalLedgerKind. */
  kind: CanonicalLedgerKind;
  /** Original ledger-group path from Tally — slash-separated, e.g.
   *  "Sundry Debtors/Local/Karnataka". Useful when the user wants
   *  to re-map groups post-import or when we re-derive `kind`. */
  groupPath?: string;
  /** GSTIN (15 chars) if present in the source. The mapper uses
   *  GSTIN as the primary dedup key against native Quikfinance
   *  contacts — when an existing contact in the org has the same
   *  GSTIN, we link rather than create. */
  gstin?: string;
  /** State-code from the source. Drives place-of-supply logic. */
  stateCode?: string;
  /** Free-form mailing address as one string. We don't try to
   *  parse it into structured fields — Tally addresses are
   *  notoriously inconsistent. */
  address?: string;
  /** Phone / mobile if present in source. */
  phone?: string;
  /** Email if present in source. */
  email?: string;
  /** Opening balance at the start of the imported period. Positive
   *  for debit-side, negative for credit-side. Quikfinance's native
   *  data treats these as opening-balance entries; Companion just
   *  records them verbatim. */
  openingBalance?: number;
  /** As-of date for the opening balance. */
  openingBalanceAsOf?: string; // ISO date
  /** Catch-all for source-specific fields the canonical format
   *  doesn't model yet. Surfaced in the import report as
   *  "additional fields ignored" rather than silently dropped. */
  raw: Record<string, unknown>;
};

export type CanonicalVoucherType =
  /** Customer invoice — generates AR on the Tally side. */
  | "sales"
  /** Vendor bill — generates AP. */
  | "purchase"
  /** Customer payment received — discharges AR. */
  | "receipt"
  /** Vendor payment made — discharges AP. */
  | "payment"
  /** Compound debit/credit journal — Manual Journal in Quikfinance. */
  | "journal"
  /** Sales return / customer credit. */
  | "credit_note"
  /** Purchase return / vendor debit. */
  | "debit_note"
  /** Contra entry (bank-to-bank, bank-to-cash). */
  | "contra";

export type CanonicalLine = {
  /** Stock-item name if this is a goods/services line. Optional
   *  because journal vouchers have ledger-only lines with no item. */
  itemName?: string;
  /** HSN / SAC code (used for GST classification). */
  hsn?: string;
  /** Item quantity. For service lines, often 1 or absent. */
  quantity?: number;
  /** Per-unit rate. */
  rate?: number;
  /** Pre-tax amount for the line. Always populated. Computed from
   *  qty * rate when those are present and the source doesn't
   *  give an explicit amount. */
  amount: number;
  /** Tax rate as a percentage (e.g. 18 for 18% GST). */
  taxRate?: number;
  /** Tax amount in currency units. Sum of CGST+SGST or IGST. */
  taxAmount?: number;
  /** The Tally ledger this line debits/credits — useful for
   *  reconstructing the journal voucher accurately. For Sales
   *  vouchers, expect "Sales Account" / similar income ledgers. */
  ledgerRef?: string;
  /** Source-specific extras. */
  raw: Record<string, unknown>;
};

export type CanonicalVoucher = {
  sourceFormat: SourceFormat;
  /** Tally / source GUID. Idempotency key. */
  sourceGuid: string;
  /** Voucher number as Tally / source assigned it. Free-form text
   *  (Tally allows "INV/2024-25/001" — we don't reformat). */
  sourceVoucherNumber: string;
  type: CanonicalVoucherType;
  /** Date of the voucher in ISO yyyy-MM-dd. Tally exports as
   *  yyyyMMdd; the parser converts. */
  date: string;
  /** Reference to the party ledger (customer for Sales, vendor for
   *  Purchase). Optional because journals may have no single party.
   *  The mapper uses sourceGuid to link to the imported
   *  CompanionLedger row. */
  partyRef?: {
    sourceGuid: string;
    displayName: string;
    gstin?: string;
  };
  /** Place of supply (state name) — used for IGST vs CGST+SGST. */
  placeOfSupply?: string;
  /** All line items / ledger lines for this voucher. */
  lines: CanonicalLine[];
  /** Free-text narration / description Tally users often put on
   *  vouchers ("Invoice for AMC services Q1 FY26"). Preserved
   *  verbatim. */
  narration?: string;
  /** Aggregate totals as they appear on the voucher. We re-derive
   *  these from the lines in tests, but trust the source's values
   *  for the import itself (Tally can have rounding adjustments). */
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  /** Currency code if the source supports multi-currency. */
  currency?: string;
  /** Source-specific extras (cost centers, optional voucher flag,
   *  reversing flag, etc.). */
  raw: Record<string, unknown>;
};

/** Result a parser returns. Includes warnings so the upload route
 *  can surface unmapped voucher types / encoding issues / etc. to
 *  the user without rejecting the whole file. */
export type ParseResult = {
  sourceFormat: SourceFormat;
  ledgers: CanonicalLedger[];
  vouchers: CanonicalVoucher[];
  warnings: ParseWarning[];
};

export type ParseWarning = {
  /** Short stable code (e.g. "unmapped_voucher_type",
   *  "missing_party_ref"). Easier to group + filter in reports than
   *  free-text messages. */
  code: string;
  /** Human-readable detail. */
  message: string;
  /** Optional source GUID this warning relates to — lets the UI
   *  link the warning back to a specific row. */
  sourceGuid?: string;
};

/** Interface every format parser implements. Lets the upload
 *  route detect format + dispatch without hard-coding source
 *  names. */
export interface FormatParser {
  /** Inspect the first few KB of a file to decide whether THIS
   *  parser can handle it. Cheaper than full parse — used by the
   *  upload endpoint to route the file. */
  detect(sample: string): boolean;
  /** Full parse. Streaming under the hood for large files. */
  parse(xml: string): Promise<ParseResult>;
}
