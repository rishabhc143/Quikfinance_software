import { z } from "zod";

/**
 * ACCT-A.3.c — Attachment policy for Manual Journals.
 *
 * Lives in `lib/` (not in `"use server"` actions.ts) so Vitest can
 * import without dragging NextAuth/Prisma. The action file re-imports
 * the schema + constants to validate uploads at the org boundary.
 *
 * Spec: 5 files max, 10 MB each. Storage is data-URL based for v1.
 */

export const MAX_MANUAL_JOURNAL_ATTACHMENTS = 5;
export const MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const manualJournalAttachmentSchema = z.object({
  fileName: z.string().min(1).max(200),
  fileUrl: z.string().min(1),
  fileSize: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(
      MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES,
      `Each attachment must be ≤ ${MAX_MANUAL_JOURNAL_ATTACHMENT_BYTES / 1024 / 1024} MB`
    ),
  mimeType: z.string().min(1).max(120),
});

export const manualJournalAttachmentsSchema = z
  .array(manualJournalAttachmentSchema)
  .max(
    MAX_MANUAL_JOURNAL_ATTACHMENTS,
    `Maximum ${MAX_MANUAL_JOURNAL_ATTACHMENTS} attachments`
  )
  .optional()
  .default([]);

export type ManualJournalAttachmentInput = z.infer<
  typeof manualJournalAttachmentSchema
>;
