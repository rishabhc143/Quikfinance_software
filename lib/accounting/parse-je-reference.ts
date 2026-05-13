/**
 * Parse the structured `JournalEntry.reference` keys we write across
 * BNK-D/E + RPT-B/B.2/B.3 into a friendly label + an optional source-
 * record link.
 *
 * See `docs/accounting-architecture.md` §3 for the full convention.
 * Examples this parses:
 *
 *   INV-SENT:cm0xyz...                          → Invoice sent
 *   INV-PMT:cmAaa...:cmBbb...                   → Invoice payment (links to invoice)
 *   BILL-OPEN:cm123...                          → Bill open
 *   BILL-PMT:cmAaa...:cmBbb...                  → Bill payment
 *   BILL-PMT-ADV:cmAaa...:cmBbb...              → Bill payment from advance
 *   CN-OPEN:cm123...                            → Credit note opened
 *   CN-REFUND:cmAaa...:cmBbb...                 → Credit note refund
 *   VC-OPEN:cm123...                            → Vendor credit opened
 *   VC-REFUND:cmAaa...:cmBbb...                 → Vendor credit refund
 *   INV-WRITEOFF:cm123...                       → Invoice write-off
 *   BILL-WRITEOFF:cm123...                      → Bill write-off
 *   VA-CREATE:cm123...                          → Vendor advance created
 *
 * Pure function — no DB. UI uses it to render badges + source links.
 */

export type JeSourceKind =
  | "INVOICE_SENT"
  | "INVOICE_PAYMENT"
  | "INVOICE_WRITEOFF"
  | "BILL_OPEN"
  | "BILL_PAYMENT"
  | "BILL_PAYMENT_ADVANCE"
  | "BILL_WRITEOFF"
  | "CREDIT_NOTE_OPEN"
  | "CREDIT_NOTE_REFUND"
  | "VENDOR_CREDIT_OPEN"
  | "VENDOR_CREDIT_REFUND"
  | "VENDOR_ADVANCE"
  | "MANUAL_JOURNAL";

export type JeReferenceParsed = {
  kind: JeSourceKind;
  label: string;
  /** The "primary" source id — the thing the link should point at. */
  sourceId: string;
  /** Relative URL to the source detail page, or null if no nav target. */
  sourceHref: string | null;
};

/**
 * Map of prefix → parser. Each entry knows its label, where to find
 * the primary source id, and what route to link to.
 */
const PARSERS: Array<{
  prefix: string;
  kind: JeSourceKind;
  label: string;
  /** For multi-part keys, which segment is the primary source id. */
  pickPrimary: (parts: string[]) => string;
  href: (id: string) => string | null;
}> = [
  {
    prefix: "INV-SENT:",
    kind: "INVOICE_SENT",
    label: "Invoice sent",
    pickPrimary: (p) => p[0],
    href: (id) => `/sales/invoices/${id}`,
  },
  {
    prefix: "INV-PMT:",
    kind: "INVOICE_PAYMENT",
    label: "Payment received",
    // Format: <paymentReceivedId>:<invoiceId> — link to invoice
    pickPrimary: (p) => p[1] ?? p[0],
    href: (id) => `/sales/invoices/${id}`,
  },
  {
    prefix: "INV-WRITEOFF:",
    kind: "INVOICE_WRITEOFF",
    label: "Invoice written off",
    pickPrimary: (p) => p[0],
    href: (id) => `/sales/invoices/${id}`,
  },
  // Order matters: more-specific prefix first.
  {
    prefix: "BILL-PMT-ADV:",
    kind: "BILL_PAYMENT_ADVANCE",
    label: "Bill paid (from advance)",
    pickPrimary: (p) => p[1] ?? p[0],
    href: (id) => `/purchases/bills/${id}`,
  },
  {
    prefix: "BILL-PMT:",
    kind: "BILL_PAYMENT",
    label: "Bill payment",
    pickPrimary: (p) => p[1] ?? p[0],
    href: (id) => `/purchases/bills/${id}`,
  },
  {
    prefix: "BILL-OPEN:",
    kind: "BILL_OPEN",
    label: "Bill opened",
    pickPrimary: (p) => p[0],
    href: (id) => `/purchases/bills/${id}`,
  },
  {
    prefix: "BILL-WRITEOFF:",
    kind: "BILL_WRITEOFF",
    label: "Bill written off",
    pickPrimary: (p) => p[0],
    href: (id) => `/purchases/bills/${id}`,
  },
  {
    prefix: "CN-REFUND:",
    kind: "CREDIT_NOTE_REFUND",
    label: "Credit note refunded",
    pickPrimary: (p) => p[0],
    href: (id) => `/sales/credit-notes/${id}`,
  },
  {
    prefix: "CN-OPEN:",
    kind: "CREDIT_NOTE_OPEN",
    label: "Credit note opened",
    pickPrimary: (p) => p[0],
    href: (id) => `/sales/credit-notes/${id}`,
  },
  {
    prefix: "VC-REFUND:",
    kind: "VENDOR_CREDIT_REFUND",
    label: "Vendor credit refunded",
    pickPrimary: (p) => p[0],
    href: (id) => `/purchases/vendor-credits/${id}`,
  },
  {
    prefix: "VC-OPEN:",
    kind: "VENDOR_CREDIT_OPEN",
    label: "Vendor credit opened",
    pickPrimary: (p) => p[0],
    href: (id) => `/purchases/vendor-credits/${id}`,
  },
  {
    prefix: "VA-CREATE:",
    kind: "VENDOR_ADVANCE",
    label: "Vendor advance",
    pickPrimary: (p) => p[0],
    href: (id) => `/purchases/payments-made/${id}`,
  },
  {
    prefix: "MJ:",
    kind: "MANUAL_JOURNAL",
    label: "Manual journal",
    pickPrimary: (p) => p[0],
    href: (id) => `/accountant/manual-journals/${id}`,
  },
];

/**
 * Returns a parsed shape if `reference` matches one of our structured
 * keys; null otherwise (manual journal entries from the UI keep their
 * free-text reference).
 */
export function parseJeReference(
  reference: string | null | undefined
): JeReferenceParsed | null {
  if (!reference) return null;
  for (const p of PARSERS) {
    if (reference.startsWith(p.prefix)) {
      const rest = reference.slice(p.prefix.length);
      const parts = rest.split(":");
      const sourceId = p.pickPrimary(parts);
      if (!sourceId) return null;
      return {
        kind: p.kind,
        label: p.label,
        sourceId,
        sourceHref: p.href(sourceId),
      };
    }
  }
  return null;
}

/** Whether the reference looks like a structured (auto-created) JE. */
export function isStructuredJeReference(
  reference: string | null | undefined
): boolean {
  return parseJeReference(reference) !== null;
}
