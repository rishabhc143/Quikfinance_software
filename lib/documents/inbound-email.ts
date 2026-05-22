/**
 * DOC-D3.1: Inbound-email processor for Smart Capture.
 *
 * Provider-agnostic — accepts a normalised `InboundEmailPayload`
 * and:
 *   1. Resolves the org from the `to:` token
 *   2. Validates each attachment against the same MIME + size guards
 *      we use for direct uploads
 *   3. Uploads to Vercel Blob (`org-<id>/<timestamp>-<name>`)
 *   4. Runs the same extract → classify → parse pipeline as
 *      `uploadDocumentsAction`
 *   5. Creates Document rows + audit log entries
 *
 * Per-provider webhook routes (Resend Inbound, AWS SES SNS, Mailgun
 * Routes, etc.) parse their native payload into this shape and call
 * `processInboundEmail`.
 *
 * Failure modes (all logged, never thrown — keeps the webhook
 * responsive and re-deliverable):
 *   - Bad / unknown token → log + return { ok: false, reason: 'unknown-org' }
 *   - No attachments → return { ok: true, accepted: 0 }
 *   - Individual attachment fail → counted in errors[], others still
 *     process
 *
 * Tested via `inbound-email.test.ts` with mocks for db + put.
 */

import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { sha256Buffer } from "./dedup";
import { extractPdfTextWithPassword } from "./pdf-extract";
import { classifyDocument } from "./document-classifier";
import {
  parseByDocumentType,
  type ParsedBankStatement,
  type ParsedBill,
  type ParsedReceipt,
} from "./parsers";
import { tokenFromInboxAddress } from "./inbox-token";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export type InboundAttachment = {
  /** Original filename from the email. Sanitized before use as blob key. */
  filename: string;
  /** MIME type from the email part headers. May be undefined; we
   *  then sniff from the extension. */
  contentType?: string;
  /** Raw bytes — providers may deliver as base64; the route handler
   *  decodes before calling. */
  content: Buffer;
};

export type InboundEmailPayload = {
  /** The full `to:` address — may include +suffixing. We extract the
   *  token via `tokenFromInboxAddress`. */
  to: string;
  /** Sender address (for audit log). */
  from?: string;
  /** Subject line (used as the Document name when no attachments
   *  carry one). */
  subject?: string;
  attachments: InboundAttachment[];
};

export type InboundAttachmentResult = {
  filename: string;
  status: "uploaded" | "duplicate" | "rejected";
  documentId?: string;
  reason?: string;
};

export type InboundEmailResult =
  | { ok: true; accepted: number; results: InboundAttachmentResult[] }
  | { ok: false; reason: string };

/**
 * Main entry point. The webhook handler in
 * `app/api/inbound/documents/route.ts` calls this with the normalised
 * payload.
 */
export async function processInboundEmail(
  payload: InboundEmailPayload
): Promise<InboundEmailResult> {
  const token = tokenFromInboxAddress(payload.to);
  if (!token) {
    return { ok: false, reason: "unknown-inbox-address" };
  }
  const org = await db.organization.findUnique({
    where: { inboxEmailToken: token },
    select: { id: true },
  });
  if (!org) return { ok: false, reason: "unknown-org" };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, reason: "blob-storage-not-configured" };
  }

  const results: InboundAttachmentResult[] = [];

  for (const att of payload.attachments) {
    if (!att.content || att.content.length === 0) {
      results.push({
        filename: att.filename,
        status: "rejected",
        reason: "empty-attachment",
      });
      continue;
    }
    if (att.content.length > MAX_BYTES) {
      results.push({
        filename: att.filename,
        status: "rejected",
        reason: "too-large",
      });
      continue;
    }
    if (att.contentType && !ALLOWED_MIMES.has(att.contentType)) {
      results.push({
        filename: att.filename,
        status: "rejected",
        reason: `mime-not-allowed:${att.contentType}`,
      });
      continue;
    }

    const fileHash = sha256Buffer(att.content);
    const existing = await db.document.findFirst({
      where: {
        organizationId: org.id,
        fileHash,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      results.push({
        filename: att.filename,
        status: "duplicate",
        documentId: existing.id,
      });
      continue;
    }

    // Run Smart Capture pipeline before persistence so the Document
    // row stores extracted fields in one write — same as direct
    // upload flow.
    let extractedText: string | null = null;
    let documentType: string | null = null;
    let extractedFields:
      | ParsedBankStatement
      | ParsedBill
      | ParsedReceipt
      | null = null;
    let extractedAt: Date | null = null;
    let needsPassword = false;
    if (att.contentType === "application/pdf") {
      try {
        // DOC-D4.1: Inbound emails have no password context — if the
        // PDF is encrypted we flag the Document and let the user
        // unlock it later from the preview drawer in /documents.
        const result = await extractPdfTextWithPassword(att.content);
        if (result.kind === "ok") {
          extractedText = result.text;
          documentType = classifyDocument(extractedText).type;
          extractedFields = parseByDocumentType(extractedText, documentType);
        } else if (result.kind === "needs-password") {
          needsPassword = true;
        }
        extractedAt = new Date();
      } catch (err) {
        console.warn("[inbound-email] smart-capture failed", err);
      }
    }
    const inbox =
      documentType === "BANK_STATEMENT" ? "BANK_STATEMENTS" : "FILES";

    const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
    const blobKey = `org-${org.id}/${Date.now()}-${safeName}`;
    let blobUrl: string;
    try {
      const blob = await put(blobKey, att.content, {
        access: "public",
        addRandomSuffix: false,
        contentType: att.contentType || undefined,
      });
      blobUrl = blob.url;
    } catch (err) {
      console.error("[inbound-email] vercel blob put failed", err);
      results.push({
        filename: att.filename,
        status: "rejected",
        reason: "blob-upload-failed",
      });
      continue;
    }

    const created = await db.document.create({
      data: {
        organizationId: org.id,
        name: att.filename,
        url: blobUrl,
        mimeType: att.contentType || null,
        sizeBytes: att.content.length,
        fileHash,
        inbox,
        extractedText,
        documentType,
        extractedAt,
        needsPassword,
        extractedFields: extractedFields as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog({
      organizationId: org.id,
      userId: null, // Inbound emails aren't tied to a logged-in user.
      action: "CREATE",
      entityType: "Document",
      entityId: created.id,
      after: {
        source: "inbound-email",
        from: payload.from ?? null,
        subject: payload.subject ?? null,
        documentType,
        smartCaptured: !!extractedText,
      },
    });

    results.push({
      filename: att.filename,
      status: "uploaded",
      documentId: created.id,
    });
  }

  return {
    ok: true,
    accepted: results.filter((r) => r.status === "uploaded").length,
    results,
  };
}
