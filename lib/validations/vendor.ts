import { z } from "zod";

/**
 * Purchases module — Vendor (Contact with type=VENDOR) zod schemas.
 *
 * Mirrors `lib/validations/customer.ts` but with vendor-specific
 * fields (MSME registration, default TDS, bank accounts) and
 * vendor-specific validation rules:
 *
 *  - PAN regex enforced (`ABCDE1234F` shape)
 *  - IFSC regex enforced on each bank account
 *  - Re-enter account number must match accountNumber (cross-field)
 *  - MSME number required when msmeRegistered is true
 *
 * The vendor server actions in `app/(dashboard)/purchases/vendors/
 * actions.ts` re-export `VendorInput` and `vendorSchema` from here so
 * the import wizard, the form, and the unit tests all share one
 * source of truth.
 */

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const ADDRESS_KINDS = ["billing", "shipping", "other"] as const;

export const vendorAddressSchema = z.object({
  kind: z.enum(ADDRESS_KINDS).default("billing"),
  attention: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  fax: z.string().nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

export const vendorContactPersonSchema = z.object({
  salutation: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  workPhone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  isPrimary: z.boolean().optional().default(false),
});

export const vendorBankAccountSchema = z
  .object({
    accountHolderName: z.string().nullable().optional(),
    bankName: z.string().nullable().optional(),
    accountNumber: z.string().min(1, "Account number is required"),
    /**
     * Mirror field — required by the UI to defend against typos. The
     * schema cross-validates equality below. NOT persisted (no column
     * exists on `ContactBankAccount`).
     */
    reEnteredAccountNumber: z.string().optional(),
    ifscCode: z
      .string()
      .regex(IFSC_REGEX, "IFSC must be 4 letters + 0 + 6 alphanumeric"),
    isDefault: z.boolean().optional().default(false),
  })
  .refine(
    (b) =>
      !b.reEnteredAccountNumber ||
      b.reEnteredAccountNumber === b.accountNumber,
    {
      message: "Re-entered account number does not match",
      path: ["reEnteredAccountNumber"],
    }
  );

export const vendorSchema = z
  .object({
    salutation: z.string().nullable().optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    displayName: z.string().min(1, "Display name is required"),
    email: z.string().email().nullable().optional().or(z.literal("")),
    workPhone: z.string().nullable().optional(),
    workPhoneCountry: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    mobileCountry: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    pan: z
      .string()
      .nullable()
      .optional()
      .refine(
        (p) => !p || PAN_REGEX.test(p),
        "PAN must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)"
      ),
    gstin: z.string().nullable().optional(),
    gstTreatment: z.string().nullable().optional(),
    placeOfSupply: z.string().nullable().optional(),
    taxPreference: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    accountsPayableId: z.string().nullable().optional(),
    openingBalance: z.coerce.number().optional().nullable(),
    paymentTermsId: z.string().nullable().optional(),
    defaultTdsId: z.string().nullable().optional(),
    enableVendorPortal: z.boolean().optional().default(false),
    msmeRegistered: z.boolean().nullable().optional(),
    msmeNumber: z.string().nullable().optional(),
    msmeCategory: z.string().nullable().optional(),
    msmeRegisteredDate: z.string().nullable().optional(),
    websiteUrl: z.string().nullable().optional(),
    facebookUrl: z.string().nullable().optional(),
    twitterHandle: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    bankAccounts: z.array(vendorBankAccountSchema).optional().default([]),
    addresses: z.array(vendorAddressSchema).optional().default([]),
    contactPersons: z.array(vendorContactPersonSchema).optional().default([]),
  })
  .refine(
    (v) => {
      // MSME number is required when MSME is toggled on (spec calls
      // it out as required when the vendor declares MSME status).
      if (!v.msmeRegistered) return true;
      return !!v.msmeNumber && v.msmeNumber.trim().length > 0;
    },
    {
      message: "MSME number is required when MSME is registered",
      path: ["msmeNumber"],
    }
  );

export type VendorInput = z.input<typeof vendorSchema>;
export type VendorParsed = z.output<typeof vendorSchema>;
