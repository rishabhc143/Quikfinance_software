import { z } from "zod";
import { attachmentsField } from "./shared-fields";

/**
 * Purchases module — PurchaseOrder zod schemas.
 *
 * Shape mirrors `lib/validations/sales-order.ts` but is vendor-side:
 *   - `contactId` is the VENDOR's Contact.id (filter by type=VENDOR
 *     at the query layer; the column itself is the same).
 *   - `accountId` per line — the inline ACCOUNT column added in
 *     PR #82's TransactionLineItemsTable extension.
 *   - `placeOfSupply` — captured by <AtTransactionLevelDropdown>.
 *   - `deliveryAddressMode` — "ORGANIZATION" (default) or "CUSTOMER"
 *     (drop-ship). When CUSTOMER, `deliveryToCustomerId` is set.
 *   - Email-send flag is conveyed via the action's `opts.send`, not
 *     the schema; the schema just covers the persistent shape.
 */

export const purchaseOrderLineSchema = z.object({
  itemId: z.string().nullable().optional(),
  position: z.coerce.number().int().nonnegative().default(0),
  name: z.string().min(1, "Item name required").max(500),
  description: z.string().max(2000).nullable().optional(),
  hsnSacCode: z.string().max(20).nullable().optional(),
  /** Inline ACCOUNT column on PurchaseOrderLineItem (PR #81). */
  accountId: z.string().nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  unit: z.string().max(20).nullable().optional(),
  rate: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  discountType: z.enum(["percentage", "amount"]).default("percentage"),
  taxId: z.string().nullable().optional(),
});
export type PurchaseOrderLineInput = z.input<typeof purchaseOrderLineSchema>;

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_BILLED",
  "BILLED",
  "CLOSED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatusValue =
  (typeof PURCHASE_ORDER_STATUSES)[number];

export const purchaseOrderSchema = z.object({
  contactId: z.string().min(1, "Vendor required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  orderDate: z.coerce.date(),
  deliveryDate: z.coerce.date().nullable().optional(),
  paymentTermsId: z.string().nullable().optional(),
  shipmentPreferenceId: z.string().nullable().optional(),
  deliveryAddressMode: z
    .enum(["ORGANIZATION", "CUSTOMER"])
    .default("ORGANIZATION"),
  deliveryToCustomerId: z.string().nullable().optional(),
  deliveryAddressId: z.string().nullable().optional(),
  placeOfSupply: z.string().nullable().optional(),
  status: z.enum(PURCHASE_ORDER_STATUSES).default("DRAFT"),
  currency: z.string().min(3).max(8).default("INR"),
  documentDiscount: z
    .object({
      value: z.coerce.number().nonnegative().default(0),
      type: z.enum(["percentage", "amount"]).default("percentage"),
    })
    .optional(),
  documentTax: z
    .object({ taxId: z.string(), type: z.enum(["TDS", "TCS"]) })
    .nullable()
    .optional(),
  adjustmentLabel: z.string().max(40).nullable().optional(),
  adjustmentValue: z.coerce.number().default(0),
  notes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  attachments: attachmentsField(10),
  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, "At least one line item required"),
});

export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;
export type PurchaseOrderParsed = z.output<typeof purchaseOrderSchema>;
