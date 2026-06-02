import { z } from "zod";

/**
 * Audit r2 (R2-1, R2-2): shared zod field helpers used by 7+ validation
 * schemas. Each transaction document (Invoice/Bill/Quote/PO/CN/DC/SO/etc.)
 * previously redeclared the same attachment array + custom-field-value
 * array inline.
 *
 * Standardised at the strictest version (was Customer-form-level
 * strictness). Postgres column types already enforce the max-lengths, so
 * tightening at the form layer is risk-free.
 */

export const attachmentSchema = z.object({
  fileName: z.string().min(1).max(200),
  fileUrl: z.string().min(1),
  fileSize: z.coerce.number().int().nonnegative(),
  mimeType: z.string().min(1).max(120),
});

export type AttachmentInput = z.input<typeof attachmentSchema>;

/**
 * Build an attachments-array field with a caller-supplied max count.
 * Quote uses max(5); most other docs use max(10); payment-made uses
 * max(5) for both attachment fields. Pass the right cap explicitly.
 *
 * The optional/default pattern matches every existing caller exactly,
 * so swapping the inline definition for `attachmentsField(N)` produces
 * an identical zod tree.
 */
export function attachmentsField(max = 10) {
  return z.array(attachmentSchema).max(max).optional().default([]);
}

/**
 * Custom-field-value array — identical shape across Invoice, Quote,
 * SalesOrder, DeliveryChallan, DebitNote forms. The `value` field is
 * `z.unknown()` because custom fields can be text/number/date/dropdown/
 * checkbox/email/url — the per-type validation happens on the value
 * field of the definition, not here.
 */
export const customFieldValuesField = z
  .array(
    z.object({
      fieldDefinitionId: z.string().min(1),
      value: z.unknown(),
    })
  )
  .optional()
  .default([]);
