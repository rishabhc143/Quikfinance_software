import { db } from "@/lib/db";

/**
 * Document types the Sales module assigns numbers for. Each maps onto a
 * NumberSeries row (orgId × module). NumberSeries is shared with Purchases —
 * see DECISIONS.md (D40).
 */
export type SalesDocumentType =
  | "QUOTE"
  | "SALES_ORDER"
  | "INVOICE"
  | "DELIVERY_CHALLAN"
  | "CREDIT_NOTE"
  | "PAYMENT_RECEIVED"
  | "RECURRING_INVOICE";

const SLUG: Record<SalesDocumentType, string> = {
  QUOTE: "quote",
  SALES_ORDER: "salesOrder",
  INVOICE: "invoice",
  DELIVERY_CHALLAN: "deliveryChallan",
  CREDIT_NOTE: "creditNote",
  PAYMENT_RECEIVED: "paymentReceived",
  RECURRING_INVOICE: "recurringInvoice",
};

const DEFAULT_PREFIX: Record<SalesDocumentType, string> = {
  QUOTE: "QT-",
  SALES_ORDER: "SO-",
  INVOICE: "INV-",
  DELIVERY_CHALLAN: "DC-",
  CREDIT_NOTE: "CN-",
  PAYMENT_RECEIVED: "RCV-",
  RECURRING_INVOICE: "RECINV-",
};

/**
 * Atomically reserve and return the next number for a document type. Uses an
 * upsert-with-increment pattern; concurrent inserts get distinct values
 * because the database serializes the row UPDATE.
 */
export async function getNextDocumentNumber(
  organizationId: string,
  docType: SalesDocumentType
): Promise<string> {
  const moduleSlug = SLUG[docType];
  const series = await db.numberSeries.upsert({
    where: { organizationId_module: { organizationId, module: moduleSlug } },
    update: { nextValue: { increment: 1 } },
    create: {
      organizationId,
      module: moduleSlug,
      prefix: DEFAULT_PREFIX[docType],
      nextValue: 2, // we are about to consume 1
      padding: 5,
    },
  });
  const consumed = series.nextValue - 1;
  return `${series.prefix}${String(consumed).padStart(series.padding, "0")}`;
}

/**
 * Peek at the next number without consuming it. Returns the prefix-formatted
 * value the next call to getNextDocumentNumber would assign.
 */
export async function peekNextDocumentNumber(
  organizationId: string,
  docType: SalesDocumentType
): Promise<string> {
  const moduleSlug = SLUG[docType];
  const series = await db.numberSeries.findUnique({
    where: { organizationId_module: { organizationId, module: moduleSlug } },
  });
  if (!series) {
    return `${DEFAULT_PREFIX[docType]}${"1".padStart(5, "0")}`;
  }
  return `${series.prefix}${String(series.nextValue).padStart(series.padding, "0")}`;
}
