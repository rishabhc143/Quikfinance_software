/**
 * DOC-D2.1: Document type classifications + display labels.
 *
 * Single source of truth for the `documentType` string stored on
 * Document — keeps the classifier, the badge renderer, and the
 * future per-type "Create X" buttons in lockstep.
 *
 * D2.1 populates only the type field (no parsers yet); D2.2+ uses
 * the type to route into per-type parsers (bank statement → HDFC/
 * ICICI parsers; bill → GSTIN parser; etc).
 */

export type DocumentType =
  | "BANK_STATEMENT"
  | "BILL"
  | "INVOICE"
  | "RECEIPT"
  | "CONTRACT"
  | "UNKNOWN";

export const KNOWN_DOCUMENT_TYPES: readonly DocumentType[] = [
  "BANK_STATEMENT",
  "BILL",
  "INVOICE",
  "RECEIPT",
  "CONTRACT",
  "UNKNOWN",
] as const;

/**
 * Type-narrow + validate a raw string. Returns null for unknown
 * values so DB rows from older migrations stay safe.
 */
export function asDocumentType(
  raw: string | null | undefined
): DocumentType | null {
  if (!raw) return null;
  if ((KNOWN_DOCUMENT_TYPES as readonly string[]).includes(raw)) {
    return raw as DocumentType;
  }
  return null;
}

/**
 * Friendly label for the badge / type chip in the preview drawer +
 * Bank Statements inbox view.
 */
export function labelForDocumentType(type: DocumentType): string {
  switch (type) {
    case "BANK_STATEMENT":
      return "Bank Statement";
    case "BILL":
      return "Bill";
    case "INVOICE":
      return "Invoice";
    case "RECEIPT":
      return "Receipt";
    case "CONTRACT":
      return "Contract";
    case "UNKNOWN":
      return "Unknown";
  }
}

/**
 * Tailwind badge color tuple per type. Picks calm hues that read
 * well against the white background of the preview drawer and the
 * sidebar inbox rows.
 */
export function badgeClassFor(type: DocumentType): string {
  switch (type) {
    case "BANK_STATEMENT":
      return "bg-blue-100 text-blue-800";
    case "BILL":
      return "bg-amber-100 text-amber-800";
    case "INVOICE":
      return "bg-emerald-100 text-emerald-800";
    case "RECEIPT":
      return "bg-purple-100 text-purple-800";
    case "CONTRACT":
      return "bg-slate-100 text-slate-800";
    case "UNKNOWN":
      return "bg-muted text-muted-foreground";
  }
}
