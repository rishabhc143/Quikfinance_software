import { z } from "zod";

/**
 * CRIT-2 audit follow-up: shared zod schemas for the Contact-Person
 * structure that customer.ts and vendor.ts both consume.
 *
 * The original Customer schema used strict bounds (max-lengths,
 * email validation); the Vendor schema was loose (bare
 * `.nullable().optional()` with no length caps). We're standardising
 * on the stricter Customer-style here because:
 *   1. Postgres VARCHAR columns already enforce these lengths at the
 *      DB layer, so existing data is safe.
 *   2. Catching long inputs at form-validation time is a better UX
 *      than a Prisma error after save.
 *   3. The two forms render the SAME 6-input row UI, so accepting
 *      different inputs in each was an inconsistency users couldn't
 *      see.
 */

export const contactPersonSchema = z.object({
  salutation: z.string().max(20).optional().nullable(),
  firstName: z.string().max(120).optional().nullable(),
  lastName: z.string().max(120).optional().nullable(),
  email: z
    .string()
    .email()
    .max(200)
    .optional()
    .or(z.literal(""))
    .nullable(),
  workPhone: z.string().max(40).optional().nullable(),
  mobile: z.string().max(40).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

export type ContactPersonInput = z.input<typeof contactPersonSchema>;
export type ContactPersonData = z.infer<typeof contactPersonSchema>;
