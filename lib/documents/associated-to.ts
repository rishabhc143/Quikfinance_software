/**
 * DOC-D1.4: Helpers for resolving the polymorphic
 * `Document.associatedEntityType + associatedEntityId` pair into a
 * display label + clickable link. Powers the "ASSOCIATED TO" column.
 *
 * Each known type returns:
 *   - `label`     — what to render in the column cell
 *   - `href`      — link target (deep-link into the right module)
 *   - `typeLabel` — short prefix used as a small badge ("Invoice")
 *
 * The actual DB resolution (looking up the entity to get its name)
 * happens in the page server component which can batch by type. This
 * file just owns the type-name + URL mapping so it's a single source
 * of truth.
 */

/**
 * Supported entity types for the Associated To column. Adding a new
 * type is a 2-line change: add the literal here + extend the URL
 * builder below.
 */
export type AssociatedEntityType =
  | "Invoice"
  | "Bill"
  | "Contact"
  | "Quote"
  | "SalesOrder"
  | "CreditNote"
  | "DeliveryChallan"
  | "PurchaseOrder"
  | "VendorCredit"
  | "Expense"
  | "PaymentReceived"
  | "PaymentMade"
  | "ManualJournal"
  | "Project"
  | "BankTransaction";

export const KNOWN_ASSOCIATED_ENTITY_TYPES: readonly AssociatedEntityType[] = [
  "Invoice",
  "Bill",
  "Contact",
  "Quote",
  "SalesOrder",
  "CreditNote",
  "DeliveryChallan",
  "PurchaseOrder",
  "VendorCredit",
  "Expense",
  "PaymentReceived",
  "PaymentMade",
  "ManualJournal",
  "Project",
  "BankTransaction",
] as const;

/**
 * Type-narrow + validate a raw string against the known set.
 * Returns null when the type isn't recognised (forward-compat with
 * new modules that haven't been wired here yet).
 */
export function asAssociatedEntityType(
  raw: string | null | undefined
): AssociatedEntityType | null {
  if (!raw) return null;
  if ((KNOWN_ASSOCIATED_ENTITY_TYPES as readonly string[]).includes(raw)) {
    return raw as AssociatedEntityType;
  }
  return null;
}

/**
 * Display short label for the type chip. Used both for the column
 * cell prefix and any small badge UI.
 */
export function typeLabelFor(type: AssociatedEntityType): string {
  switch (type) {
    case "Invoice":
      return "Invoice";
    case "Bill":
      return "Bill";
    case "Contact":
      return "Contact";
    case "Quote":
      return "Quote";
    case "SalesOrder":
      return "Sales Order";
    case "CreditNote":
      return "Credit Note";
    case "DeliveryChallan":
      return "Delivery Challan";
    case "PurchaseOrder":
      return "Purchase Order";
    case "VendorCredit":
      return "Vendor Credit";
    case "Expense":
      return "Expense";
    case "PaymentReceived":
      return "Payment Received";
    case "PaymentMade":
      return "Payment Made";
    case "ManualJournal":
      return "Manual Journal";
    case "Project":
      return "Project";
    case "BankTransaction":
      return "Bank Transaction";
  }
}

/**
 * Build the deep-link href for a given (type, id). Stays in this
 * module so the mapping is reviewed in one place when route shapes
 * change.
 */
export function hrefForAssociated(
  type: AssociatedEntityType,
  id: string
): string {
  switch (type) {
    case "Invoice":
      return `/sales/invoices/${id}`;
    case "Bill":
      return `/purchases/bills/${id}`;
    case "Contact":
      return `/sales/customers/${id}`;
    case "Quote":
      return `/sales/quotes/${id}`;
    case "SalesOrder":
      return `/sales/sales-orders/${id}`;
    case "CreditNote":
      return `/sales/credit-notes/${id}`;
    case "DeliveryChallan":
      return `/sales/delivery-challans/${id}`;
    case "PurchaseOrder":
      return `/purchases/orders/${id}`;
    case "VendorCredit":
      return `/purchases/vendor-credits/${id}`;
    case "Expense":
      return `/purchases/expenses/${id}`;
    case "PaymentReceived":
      return `/sales/payments-received/${id}`;
    case "PaymentMade":
      return `/purchases/payments-made/${id}`;
    case "ManualJournal":
      return `/accountant/manual-journals/${id}`;
    case "Project":
      return `/time/projects/${id}`;
    case "BankTransaction":
      // We no longer have a global /banking/transactions list — fall back
      // to the Banking landing page (user picks the account from there).
      // The deep BankTransaction ID is dropped but the link still lands
      // in the right module.
      return `/banking`;
  }
}

/**
 * Tiny shape the page passes to the table so the cell can render the
 * link + label without knowing about the lookup mechanics.
 */
export type AssociatedToCell = {
  type: AssociatedEntityType;
  id: string;
  /** Resolved display name — e.g. "INV-001", "Acme Holdings".
   *  Falls back to the id when the entity is soft-deleted / missing. */
  name: string;
  href: string;
  typeLabel: string;
};

/**
 * Convenience builder used by `page.tsx` to assemble the cell once
 * the entity name has been resolved.
 */
export function buildAssociatedToCell(
  type: AssociatedEntityType,
  id: string,
  name: string | null | undefined
): AssociatedToCell {
  return {
    type,
    id,
    name: name && name.trim() ? name : id,
    href: hrefForAssociated(type, id),
    typeLabel: typeLabelFor(type),
  };
}
