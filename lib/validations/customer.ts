import { z } from "zod";

/**
 * Sales module — Customer (Contact with type=CUSTOMER) zod schemas.
 *
 * Source of truth for both the New Customer form and the importCustomers
 * server action. The schema enforces the spec's GSTIN regex, PAN format,
 * and uniqueness of displayName per organization (the action layer
 * dedupes; this schema only validates shape).
 */

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const addressSchema = z.object({
  kind: z.enum(["billing", "shipping", "other"]).default("billing"),
  attention: z.string().max(200).optional().nullable(),
  country: z.string().min(1).max(80).default("India"),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  fax: z.string().max(40).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
});

export const contactPersonSchema = z.object({
  salutation: z.string().max(20).optional().nullable(),
  firstName: z.string().max(120).optional().nullable(),
  lastName: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200).optional().or(z.literal("")).nullable(),
  workPhone: z.string().max(40).optional().nullable(),
  mobile: z.string().max(40).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

export const customerSchema = z.object({
  customerType: z.enum(["BUSINESS", "INDIVIDUAL"]).default("BUSINESS"),
  salutation: z.string().max(20).optional().nullable(),
  firstName: z.string().max(120).optional().nullable(),
  lastName: z.string().max(120).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  displayName: z.string().min(1, "Display name is required").max(200),
  email: z
    .string()
    .email("Invalid email")
    .max(200)
    .optional()
    .or(z.literal(""))
    .nullable(),
  workPhone: z.string().max(40).optional().nullable(),
  workPhoneCountry: z.string().max(8).default("+91"),
  mobile: z.string().max(40).optional().nullable(),
  mobileCountry: z.string().max(8).default("+91"),
  language: z.string().max(8).default("en"),
  pan: z
    .string()
    .transform((s) => (s ? s.toUpperCase() : s))
    .refine((s) => !s || PAN_REGEX.test(s), "PAN must match AAAAA9999A")
    .optional()
    .nullable(),
  gstin: z
    .string()
    .transform((s) => (s ? s.toUpperCase() : s))
    .refine((s) => !s || GSTIN_REGEX.test(s), "GSTIN format invalid")
    .optional()
    .nullable(),
  gstTreatment: z.string().max(40).optional().nullable(),
  placeOfSupply: z.string().max(80).optional().nullable(),
  taxPreference: z.enum(["taxable", "tax_exempt"]).optional().nullable(),
  currency: z.string().min(3).max(8).default("INR"),
  paymentTermsId: z.string().optional().nullable(),
  enablePortal: z.boolean().default(false),
  portalLanguage: z.string().max(8).optional().nullable(),
  customerOwnerId: z.string().optional().nullable(),
  openingBalance: z.coerce.number().optional().nullable(),
  openingBalanceAsOf: z.coerce.date().optional().nullable(),
  websiteUrl: z.string().url().optional().or(z.literal("")).nullable(),
  facebookUrl: z.string().url().optional().or(z.literal("")).nullable(),
  twitterHandle: z.string().max(40).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  addresses: z.array(addressSchema).max(20).optional().default([]),
  contactPersons: z.array(contactPersonSchema).max(20).optional().default([]),
});

export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerData = z.infer<typeof customerSchema>;
