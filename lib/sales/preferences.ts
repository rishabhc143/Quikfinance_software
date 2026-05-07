import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Per-document-type Sales preferences.
 *
 * Stored as a single Json column on `OrganizationPreference.salesPreferences`
 * to avoid 50+ typed columns we'd otherwise need across quotes / sales
 * orders / invoices / customers.  Null = use built-in defaults.
 */

const fieldVisibilitySchema = z.object({
  reference: z.boolean().default(true),
  project: z.boolean().default(true),
  salesperson: z.boolean().default(true),
  subject: z.boolean().default(true),
});
export type FieldVisibility = z.infer<typeof fieldVisibilitySchema>;

const docPrefsBase = z.object({
  defaultCustomerNotes: z.string().max(2000).default(""),
  defaultTermsAndConditions: z.string().max(4000).default(""),
  defaultPdfTemplateId: z.string().nullable().default(null),
  emailSubject: z.string().max(300).default(""),
  emailBody: z.string().max(4000).default(""),
  fieldVisibility: fieldVisibilitySchema.default({
    reference: true,
    project: true,
    salesperson: true,
    subject: true,
  }),
});

export const quotePrefsSchema = docPrefsBase.extend({
  defaultExpiryDays: z.coerce.number().int().min(0).max(365).default(30),
  allowOnlineAcceptDecline: z.boolean().default(true),
  notifyOnAccepted: z.boolean().default(true),
  notifyOnDeclined: z.boolean().default(true),
});
export type QuotePrefs = z.infer<typeof quotePrefsSchema>;

export const salesOrderPrefsSchema = docPrefsBase.extend({
  defaultExpectedShipmentDays: z.coerce.number().int().min(0).max(365).default(7),
});
export type SalesOrderPrefs = z.infer<typeof salesOrderPrefsSchema>;

export const invoicePrefsSchema = docPrefsBase.extend({
  defaultNetDays: z.coerce.number().int().min(0).max(365).default(30),
  reminderBeforeDays: z.coerce.number().int().min(0).max(60).default(3),
  reminderAfterDays: z.coerce.number().int().min(0).max(60).default(7),
  autoChargeCustomer: z.boolean().default(false),
});
export type InvoicePrefs = z.infer<typeof invoicePrefsSchema>;

export const customerPrefsSchema = z.object({
  defaultCurrency: z.string().min(3).max(8).default("INR"),
  defaultPaymentTermsId: z.string().nullable().default(null),
  showSalutation: z.boolean().default(true),
  showCustomerOwner: z.boolean().default(true),
});
export type CustomerPrefs = z.infer<typeof customerPrefsSchema>;

export const salesPreferencesSchema = z.object({
  quotes: quotePrefsSchema.default({} as QuotePrefs),
  salesOrders: salesOrderPrefsSchema.default({} as SalesOrderPrefs),
  invoices: invoicePrefsSchema.default({} as InvoicePrefs),
  customers: customerPrefsSchema.default({} as CustomerPrefs),
});
export type SalesPreferences = z.infer<typeof salesPreferencesSchema>;

/** Map from doc-type slug to its zod schema, used by the page actions. */
export const SLICE_SCHEMAS = {
  quotes: quotePrefsSchema,
  salesOrders: salesOrderPrefsSchema,
  invoices: invoicePrefsSchema,
  customers: customerPrefsSchema,
} as const;

export type SliceKey = keyof typeof SLICE_SCHEMAS;

/**
 * Read the full salesPreferences for an organization, parsed against the
 * schema (so missing keys fall back to defaults). The OrganizationPreference
 * row is upserted so this is safe to call on first visit.
 */
export async function getSalesPreferences(organizationId: string): Promise<SalesPreferences> {
  const pref = await db.organizationPreference.findUnique({
    where: { organizationId },
    select: { salesPreferences: true },
  });
  const raw = pref?.salesPreferences ?? {};
  return salesPreferencesSchema.parse(raw);
}

/**
 * Shallow-merge the given slice into the existing salesPreferences and
 * upsert. The unmodified slices stay intact; the targeted slice is
 * replaced with the new validated value.
 */
export async function updateSalesPreferenceSlice<K extends SliceKey>(
  organizationId: string,
  slice: K,
  partial: unknown
): Promise<SalesPreferences> {
  const schema = SLICE_SCHEMAS[slice];
  const validated = schema.parse(partial);

  // Read the existing JSON so we don't clobber the other slices
  const existing = await getSalesPreferences(organizationId);
  const next: SalesPreferences = {
    ...existing,
    [slice]: validated,
  };

  await db.organizationPreference.upsert({
    where: { organizationId },
    create: {
      organizationId,
      salesPreferences: next as unknown as object,
    },
    update: {
      salesPreferences: next as unknown as object,
    },
  });
  return next;
}
