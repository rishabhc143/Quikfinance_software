"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import { collectDescendantIds } from "@/lib/documents/folder-tree";
import { sha256Buffer, dupWarning } from "@/lib/documents/dedup";
import { extractPdfText } from "@/lib/documents/pdf-extract";
import { classifyDocument } from "@/lib/documents/document-classifier";
import {
  parseByDocumentType,
  type ParsedBankStatement,
  type ParsedBill,
  type ParsedReceipt,
} from "@/lib/documents/parsers";

const schema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  mimeType: z.string().max(80).optional().nullable(),
  folder: z.string().max(80).optional().nullable(),
});

export async function createDocumentAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    name: formData.get("name"),
    url: formData.get("url"),
    mimeType: formData.get("mimeType") || null,
    folder: formData.get("folder") || null,
  });
  const created = await db.document.create({
    data: { organizationId: organization.id, ...data, uploadedBy: user.id },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Document", entityId: created.id, after: { name: data.name } });
  revalidatePath("/documents");
  redirect("/documents");
}

/**
 * DOC-D1.4: Soft-delete a single document (move to Trash). Replaces
 * the prior hard-delete pattern. Hard delete is now `purgeDocumentAction`
 * and is reserved for the Trash view.
 */
export async function deleteDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!d) return { ok: false, error: "Document not found." };
  await db.document.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Document",
    entityId: id,
    before: { name: d.name },
    after: { trashed: true },
  });
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * DOC-D1.4: Restore a soft-deleted document from Trash. Clears
 * `deletedAt` and revalidates the documents page.
 */
export async function restoreDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: {
      id,
      organizationId: organization.id,
      deletedAt: { not: null },
    },
  });
  if (!d) return { ok: false, error: "Document not found in Trash." };
  await db.document.update({
    where: { id },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Document",
    entityId: id,
    before: { trashed: true },
    after: { restored: true },
  });
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * DOC-D1.4: Permanently delete a document from Trash. Removes the
 * DB row AND the underlying Vercel Blob (if a token is configured).
 *
 * Refuses to purge a document that isn't already in Trash — protects
 * against accidental data loss from the All Documents view.
 *
 * Blob deletion failures don't abort the purge — the DB row goes
 * either way (orphaned blobs are cheap to clean up later via the
 * Vercel dashboard).
 */
export async function purgeDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: {
      id,
      organizationId: organization.id,
      deletedAt: { not: null },
    },
  });
  if (!d) {
    return {
      ok: false,
      error:
        "Only documents already in Trash can be permanently deleted. Move it to Trash first.",
    };
  }

  // Best-effort blob deletion. The dynamic import keeps `@vercel/blob`
  // out of the bundle for paths that don't need it.
  if (process.env.BLOB_READ_WRITE_TOKEN && d.url) {
    try {
      const { del } = await import("@vercel/blob");
      await del(d.url);
    } catch (err) {
      console.warn("[documents/purge] Vercel Blob delete failed", err);
    }
  }

  await db.document.delete({ where: { id } });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Document",
    entityId: id,
    before: { name: d.name, url: d.url, trashed: true },
    after: { purged: true },
  });

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Direct-upload action — uploads a file from the browser to Vercel
 * Blob storage, then persists the resulting URL as a Document row.
 *
 * Fail-open: if `BLOB_READ_WRITE_TOKEN` is not configured (e.g. local
 * dev without Vercel Blob), returns an error string instead of
 * throwing. The UI surfaces this to the user.
 *
 * Size cap enforced server-side at 10 MB. Most receipt/contract PDFs
 * are well under this; larger media should use external hosting +
 * paste the URL.
 */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export async function uploadDocumentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error:
        "Direct file upload is not configured on this deployment. Ask your admin to add BLOB_READ_WRITE_TOKEN to the environment.",
    };
  }

  const { user, organization } = await requireOrganization();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file before uploading." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    };
  }
  if (file.type && !ALLOWED_MIMES.includes(file.type)) {
    return {
      ok: false,
      error: `File type "${file.type}" is not allowed. Supported: PDF, JPG, PNG, WEBP, HEIC, CSV, XLS, XLSX.`,
    };
  }

  const folderRaw = (formData.get("folder") as string | null) ?? "";
  const folder = folderRaw.trim().slice(0, 80) || null;
  const displayName =
    ((formData.get("name") as string | null) ?? "").trim().slice(0, 200) ||
    file.name;

  // Namespace by org so blobs are easy to audit and clean up.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobKey = `org-${organization.id}/${Date.now()}-${safeName}`;

  let blobUrl: string;
  try {
    const blob = await put(blobKey, file, {
      access: "public",
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[documents/upload] Vercel Blob put failed", err);
    return {
      ok: false,
      error: "Upload failed. Check your connection and try again.",
    };
  }

  const created = await db.document.create({
    data: {
      organizationId: organization.id,
      name: displayName,
      url: blobUrl,
      mimeType: file.type || null,
      folder,
      uploadedBy: user.id,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Document",
    entityId: created.id,
    after: { name: displayName, source: "blob-upload" },
  });
  revalidatePath("/documents");
  return { ok: true };
}

// ───────────────────── DOC-D1.2: Folder CRUD ─────────────────────
//
// Folder operations are org-scoped + cascade soft-delete (deleting a
// parent marks every descendant as deleted in one transaction). Tree
// walks use the pure `collectDescendantIds` helper so the logic is
// covered by the unit tests in `folder-tree.test.ts`.

const folderNameSchema = z
  .string()
  .min(1, "Folder name is required")
  .max(120, "Folder name is too long");

/**
 * Create a new folder. If `parentFolderId` is set, validates the
 * parent exists in the same org. Names within a parent are NOT forced
 * unique (matches Zoho — duplicates are allowed since folders are
 * disambiguated by path).
 */
export async function createFolderAction(input: {
  name: string;
  parentFolderId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const parsed = folderNameSchema.safeParse(input.name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.trim();

  if (input.parentFolderId) {
    const parent = await db.documentFolder.findFirst({
      where: {
        id: input.parentFolderId,
        organizationId: organization.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!parent) {
      return { ok: false, error: "Parent folder not found." };
    }
  }

  const created = await db.documentFolder.create({
    data: {
      organizationId: organization.id,
      name,
      parentFolderId: input.parentFolderId || null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "DocumentFolder",
    entityId: created.id,
    after: { name, parentFolderId: input.parentFolderId ?? null },
  });

  revalidatePath("/documents");
  return { ok: true, id: created.id };
}

/**
 * Rename a folder. No-op if the new name matches the current one.
 */
export async function renameFolderAction(input: {
  folderId: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const parsed = folderNameSchema.safeParse(input.name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.trim();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: input.folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };
  if (folder.name === name) return { ok: true };

  await db.documentFolder.update({
    where: { id: folder.id },
    data: { name },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { name: folder.name },
    after: { name },
  });

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Move a folder under a different parent (or to root with null).
 * Refuses to move a folder into itself or any of its descendants —
 * that would create a cycle. Uses `collectDescendantIds` to scan.
 */
export async function moveFolderAction(input: {
  folderId: string;
  newParentFolderId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: input.folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, parentFolderId: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  // Same parent → no-op, exit early.
  if ((folder.parentFolderId ?? null) === (input.newParentFolderId ?? null)) {
    return { ok: true };
  }

  if (input.newParentFolderId) {
    if (input.newParentFolderId === folder.id) {
      return { ok: false, error: "A folder cannot be its own parent." };
    }
    const newParent = await db.documentFolder.findFirst({
      where: {
        id: input.newParentFolderId,
        organizationId: organization.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!newParent) {
      return { ok: false, error: "Target parent not found." };
    }

    // Cycle check: refuse to move under a descendant.
    const allFolders = await db.documentFolder.findMany({
      where: { organizationId: organization.id, deletedAt: null },
      select: { id: true, name: true, parentFolderId: true },
    });
    const descendants = collectDescendantIds(folder.id, allFolders);
    if (descendants.includes(input.newParentFolderId)) {
      return {
        ok: false,
        error: "Cannot move a folder into one of its own subfolders.",
      };
    }
  }

  await db.documentFolder.update({
    where: { id: folder.id },
    data: { parentFolderId: input.newParentFolderId || null },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { parentFolderId: folder.parentFolderId },
    after: { parentFolderId: input.newParentFolderId ?? null },
  });

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Soft-delete a folder + every descendant in one transaction. Any
 * documents inside those folders are also soft-deleted so the user
 * can restore everything together from Trash later (PR D1.4 wires
 * Restore). Hard purge stays a Trash-only action.
 */
export async function softDeleteFolderAction(
  folderId: string
): Promise<{ ok: true; deletedCount: number } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const allFolders = await db.documentFolder.findMany({
    where: { organizationId: organization.id, deletedAt: null },
    select: { id: true, name: true, parentFolderId: true },
  });
  const ids = collectDescendantIds(folder.id, allFolders);
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const fRes = await tx.documentFolder.updateMany({
      where: {
        id: { in: ids },
        organizationId: organization.id,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    const dRes = await tx.document.updateMany({
      where: {
        folderId: { in: ids },
        organizationId: organization.id,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    return { folders: fRes.count, documents: dRes.count };
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { name: folder.name },
    after: { cascadeFolders: result.folders, cascadeDocuments: result.documents },
  });

  revalidatePath("/documents");
  return { ok: true, deletedCount: result.folders + result.documents };
}

// ───────────────────── DOC-D1.3: Multi-file upload + dedup ─────────────────────
//
// Replaces the single-file `uploadDocumentAction` flow for the Files
// inbox. Accepts N files via FormData (`file_0`, `file_1`, …), runs
// each through the same size + MIME guards, computes a SHA-256, and
// short-circuits any whose hash already exists in this org. Returns
// per-file results so the client can surface dup warnings + errors
// alongside successes.

export type UploadDocumentItemResult =
  | { fileName: string; status: "uploaded"; id: string }
  | {
      fileName: string;
      status: "duplicate";
      existingId: string;
      existingName: string;
      message: string;
    }
  | { fileName: string; status: "error"; message: string };

export type UploadDocumentsResult = {
  ok: boolean;
  results: UploadDocumentItemResult[];
};

/**
 * Multi-file upload action triggered from the Files inbox drag-drop.
 *
 * Per-file pipeline:
 *   1. Size + MIME guard (same caps as `uploadDocumentAction`)
 *   2. Read buffer + SHA-256
 *   3. Lookup `(orgId, fileHash)` in DB — if present, mark duplicate
 *      and skip Vercel Blob upload (saves bandwidth + storage)
 *   4. Otherwise upload to Vercel Blob and create a Document row with
 *      `inbox = "FILES"` + `fileHash`
 *   5. Append a result entry
 *
 * The action never throws — it returns a result list so the client
 * can render per-file success / duplicate / error feedback.
 *
 * If `BLOB_READ_WRITE_TOKEN` is missing (local dev), every file
 * surfaces as an error. Matches the fail-open pattern of
 * `uploadDocumentAction`.
 */
export async function uploadDocumentsAction(
  formData: FormData
): Promise<UploadDocumentsResult> {
  const { user, organization } = await requireOrganization();

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file_") && value instanceof File && value.size > 0) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return {
      ok: false,
      results: [
        {
          fileName: "(none)",
          status: "error",
          message: "Choose at least one file to upload.",
        },
      ],
    };
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      results: files.map((f) => ({
        fileName: f.name,
        status: "error" as const,
        message:
          "Direct file upload is not configured on this deployment. Ask your admin to add BLOB_READ_WRITE_TOKEN to the environment.",
      })),
    };
  }

  const results: UploadDocumentItemResult[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({
        fileName: file.name,
        status: "error",
        message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
      });
      continue;
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      results.push({
        fileName: file.name,
        status: "error",
        message: `File type "${file.type}" is not allowed. Supported: PDF, JPG, PNG, WEBP, HEIC, CSV, XLS, XLSX.`,
      });
      continue;
    }

    // Compute SHA-256 to check for an existing row before uploading.
    let buffer: Buffer;
    try {
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
    } catch (err) {
      console.error("[documents/upload] failed to read file buffer", err);
      results.push({
        fileName: file.name,
        status: "error",
        message: "Couldn't read the file. Try again.",
      });
      continue;
    }
    const fileHash = sha256Buffer(buffer);

    const existing = await db.document.findFirst({
      where: {
        organizationId: organization.id,
        fileHash,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true },
    });
    if (existing) {
      results.push({
        fileName: file.name,
        status: "duplicate",
        existingId: existing.id,
        existingName: existing.name,
        message: dupWarning(existing.name, existing.createdAt),
      });
      continue;
    }

    // Namespace by org so blobs are easy to audit and clean up.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blobKey = `org-${organization.id}/${Date.now()}-${safeName}`;
    let blobUrl: string;
    try {
      const blob = await put(blobKey, buffer, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type || undefined,
      });
      blobUrl = blob.url;
    } catch (err) {
      console.error("[documents/upload] Vercel Blob put failed", err);
      results.push({
        fileName: file.name,
        status: "error",
        message: "Upload failed. Check your connection and try again.",
      });
      continue;
    }

    // DOC-D2.1: Smart Capture — extract + classify the file before
    // we persist the row, so the Document gets stored WITH the
    // extracted text / type in one write. Fail-open: extraction
    // errors fall through to `null` fields and never block the
    // upload.
    let extractedText: string | null = null;
    let documentType: string | null = null;
    let extractedAt: Date | null = null;
    let extractedFields:
      | ParsedBankStatement
      | ParsedBill
      | ParsedReceipt
      | null = null;
    if (file.type === "application/pdf") {
      try {
        extractedText = await extractPdfText(buffer);
        if (extractedText) {
          const classification = classifyDocument(extractedText);
          documentType = classification.type;
          // DOC-D2.2 / D2.3: Route to the right parser based on the
          // detected type. Bank statements → transaction rows; bills
          // / invoices → vendor + GSTIN + total + line items;
          // receipts → vendor + date + total + paid-via. Fail-open
          // when parser returns null.
          extractedFields = parseByDocumentType(extractedText, documentType);
        }
        extractedAt = new Date();
      } catch (err) {
        console.warn("[documents/upload] smart-capture extract failed", err);
      }
    }

    // Auto-route bank statements into the Bank Statements inbox so
    // the sidebar count reflects them immediately. Other types stay
    // in Files until D2.3 wires Bill / Receipt routing.
    const inbox =
      documentType === "BANK_STATEMENT" ? "BANK_STATEMENTS" : "FILES";

    const created = await db.document.create({
      data: {
        organizationId: organization.id,
        name: file.name,
        url: blobUrl,
        mimeType: file.type || null,
        sizeBytes: file.size,
        fileHash,
        inbox,
        uploadedBy: user.id,
        extractedText,
        documentType,
        extractedAt,
        extractedFields:
          extractedFields as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "Document",
      entityId: created.id,
      after: {
        name: file.name,
        source: "files-inbox-bulk-upload",
        documentType,
        smartCaptured: !!extractedText,
      },
    });

    results.push({ fileName: file.name, status: "uploaded", id: created.id });
  }

  revalidatePath("/documents");
  const anyOk = results.some((r) => r.status === "uploaded");
  return { ok: anyOk, results };
}

// ───────────────────── DOC-D2.2: Import bank statement to Banking ─────────────────────

/**
 * Light helper: list the org's active BankAccount rows formatted for
 * the Import-to-Bank picker dropdown. Called client-side on dialog
 * open so we don't have to thread the whole list through the table.
 */
export async function listBankAccountsForImportAction(): Promise<
  Array<{ id: string; label: string }>
> {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, accountNumber: true },
    orderBy: { name: "asc" },
  });
  return accounts.map((a) => {
    const masked =
      a.accountNumber && a.accountNumber.length > 4
        ? `••••${a.accountNumber.slice(-4)}`
        : a.accountNumber ?? "";
    return {
      id: a.id,
      label: masked ? `${a.name} (${masked})` : a.name,
    };
  });
}


/**
 * Read the parsed rows off `Document.extractedFields`, create matching
 * `BankTransaction` rows under the chosen BankAccount, and link them
 * all to a fresh `BankImportBatch` so "Undo Last Import" works the
 * same way it does for CSV uploads.
 *
 * Dedup: skip any row whose (date, amount, description) already
 * exists for the same BankAccount. The `BankTransaction_dedup_idx`
 * index covers the lookup.
 *
 * Returns per-document counters so the UI can render
 * "Imported N · Skipped M".
 */
export async function importStatementToBankAction(input: {
  documentId: string;
  bankAccountId: string;
}): Promise<
  | { ok: true; imported: number; skipped: number; batchId: string }
  | { ok: false; error: string }
> {
  const { user, organization } = await requireOrganization();

  const doc = await db.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      extractedFields: true,
      documentType: true,
    },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (doc.documentType !== "BANK_STATEMENT") {
    return {
      ok: false,
      error: "Only bank statements can be imported to Banking.",
    };
  }

  const parsed = doc.extractedFields as unknown as ParsedBankStatement | null;
  if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    return {
      ok: false,
      error:
        "This statement has no parsed transactions. Smart Capture couldn't read the layout — re-upload or try a CSV import.",
    };
  }

  const bankAccount = await db.bankAccount.findFirst({
    where: { id: input.bankAccountId, organizationId: organization.id },
    select: { id: true },
  });
  if (!bankAccount) {
    return { ok: false, error: "Bank account not found." };
  }

  // Pre-load any existing transactions in the date window to drive
  // the dedup check. Range = min(dates) to max(dates) so we don't
  // hit the whole table.
  const dates = parsed.rows
    .map((r) => new Date(r.date))
    .filter((d) => !isNaN(d.getTime()));
  const minDate = dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null;
  const maxDate = dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null;
  const existing = minDate && maxDate
    ? await db.bankTransaction.findMany({
        where: {
          organizationId: organization.id,
          bankAccountId: bankAccount.id,
          date: { gte: minDate, lte: maxDate },
        },
        select: { date: true, amount: true, description: true },
      })
    : [];
  // Key by `${iso}|${amount}|${description}` for O(1) lookup.
  const existingKeys = new Set(
    existing.map(
      (e) =>
        `${e.date.toISOString().slice(0, 10)}|${e.amount.toString()}|${
          e.description ?? ""
        }`
    )
  );

  const batchResult = await db.$transaction(async (tx) => {
    const batch = await tx.bankImportBatch.create({
      data: {
        organizationId: organization.id,
        bankAccountId: bankAccount.id,
        uploadedById: user.id,
        fileName: doc.name,
        rowCount: 0, // updated below
        duplicateCount: 0, // updated below
      },
    });

    let imported = 0;
    let skipped = 0;
    for (const row of parsed.rows) {
      const date = new Date(row.date);
      if (isNaN(date.getTime())) {
        skipped += 1;
        continue;
      }
      const amount =
        row.credit && row.credit > 0
          ? row.credit
          : row.debit && row.debit > 0
            ? row.debit
            : 0;
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
      const type = row.credit && row.credit > 0 ? "CREDIT" : "DEBIT";
      const description = row.description.slice(0, 500);
      const key = `${row.date}|${amount}|${description}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      await tx.bankTransaction.create({
        data: {
          organizationId: organization.id,
          bankAccountId: bankAccount.id,
          date,
          description,
          amount: new Prisma.Decimal(amount),
          type,
          importBatchId: batch.id,
        },
      });
      imported += 1;
    }

    await tx.bankImportBatch.update({
      where: { id: batch.id },
      data: { rowCount: imported, duplicateCount: skipped },
    });

    return { imported, skipped, batchId: batch.id };
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "BankImportBatch",
    entityId: batchResult.batchId,
    after: {
      source: "documents-smart-capture",
      documentId: doc.id,
      imported: batchResult.imported,
      skipped: batchResult.skipped,
    },
  });

  // Link the document back to the bank account it was imported into
  // — surfaces as "Associated To" in the documents table.
  await db.document.update({
    where: { id: doc.id },
    data: {
      associatedEntityType: "BankAccount",
      associatedEntityId: bankAccount.id,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/banking");

  return {
    ok: true,
    imported: batchResult.imported,
    skipped: batchResult.skipped,
    batchId: batchResult.batchId,
  };
}

// ───────────────────── DOC-D2.3: Create Bill / Expense from Document ─────────────────────

/**
 * Light helper used by the Create-Bill picker dialog: search vendors
 * (Contact type = VENDOR) by displayName substring. Limited to 25
 * results to keep the dropdown snappy.
 */
export async function searchVendorsForDocAction(
  query: string
): Promise<Array<{ id: string; label: string; gstin: string | null }>> {
  const { organization } = await requireOrganization();
  const rows = await db.contact.findMany({
    where: {
      organizationId: organization.id,
      type: "VENDOR",
      deletedAt: null,
      OR: query
        ? [
            { displayName: { contains: query, mode: "insensitive" } },
            { gstin: { contains: query, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: { id: true, displayName: true, gstin: true },
    orderBy: { displayName: "asc" },
    take: 25,
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.displayName,
    gstin: r.gstin,
  }));
}

/**
 * DOC-D2.3: Create a DRAFT Bill prefilled from the document's parsed
 * fields. User picks the vendor + overrides any fields in the dialog
 * before submit. Action creates the Bill row + a single line item
 * carrying the total (line item splits land in D2.5).
 *
 * Returns the new Bill's id so the UI can redirect to the edit page
 * where the user can fine-tune line items, taxes, etc.
 */
export async function createBillFromDocumentAction(input: {
  documentId: string;
  vendorId: string;
  billNumber?: string;
  issueDate?: string; // yyyy-MM-dd
  dueDate?: string;
  total: number;
  notes?: string;
}): Promise<{ ok: true; billId: string } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const doc = await db.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true, documentType: true },
  });
  if (!doc) return { ok: false, error: "Document not found." };

  const vendor = await db.contact.findFirst({
    where: {
      id: input.vendorId,
      organizationId: organization.id,
      type: "VENDOR",
      deletedAt: null,
    },
    select: { id: true, displayName: true },
  });
  if (!vendor) return { ok: false, error: "Vendor not found." };

  if (!Number.isFinite(input.total) || input.total <= 0) {
    return { ok: false, error: "Total must be a positive number." };
  }

  const billNumber =
    input.billNumber?.trim() ||
    (await nextDocumentNumber(organization.id, "bill"));
  const issueDate = input.issueDate
    ? new Date(input.issueDate)
    : new Date();
  const dueDate = input.dueDate
    ? new Date(input.dueDate)
    : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const created = await db.bill.create({
    data: {
      organizationId: organization.id,
      number: billNumber,
      contactId: vendor.id,
      status: "DRAFT",
      issueDate,
      dueDate,
      subtotal: new Prisma.Decimal(input.total),
      total: new Prisma.Decimal(input.total),
      notes: input.notes?.slice(0, 2000) ?? `Created from Smart Capture · ${doc.name}`,
    },
  });

  // Link the document to the new bill via the polymorphic
  // associatedEntityType pair so the ASSOCIATED TO column lights up.
  await db.document.update({
    where: { id: doc.id },
    data: {
      associatedEntityType: "Bill",
      associatedEntityId: created.id,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Bill",
    entityId: created.id,
    after: {
      source: "documents-smart-capture",
      documentId: doc.id,
      number: billNumber,
      total: input.total,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/purchases/bills");
  return { ok: true, billId: created.id };
}

/**
 * DOC-D2.3: Create an Expense prefilled from a parsed receipt.
 * Lighter than Bill (no line items, no tax breakdown — Expense is a
 * single-line record). User picks vendor + category in the dialog.
 *
 * Returns the new Expense's id so the UI can redirect.
 */
export async function createExpenseFromDocumentAction(input: {
  documentId: string;
  vendorId?: string;
  category: string;
  date?: string; // yyyy-MM-dd
  amount: number;
  reference?: string;
  notes?: string;
}): Promise<{ ok: true; expenseId: string } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const doc = await db.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!doc) return { ok: false, error: "Document not found." };

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }
  if (!input.category?.trim()) {
    return { ok: false, error: "Category is required." };
  }

  let contactId: string | undefined;
  if (input.vendorId) {
    const vendor = await db.contact.findFirst({
      where: {
        id: input.vendorId,
        organizationId: organization.id,
        type: "VENDOR",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!vendor) return { ok: false, error: "Vendor not found." };
    contactId = vendor.id;
  }

  const number = await nextDocumentNumber(organization.id, "expense");
  const date = input.date ? new Date(input.date) : new Date();

  const created = await db.expense.create({
    data: {
      organizationId: organization.id,
      number,
      date,
      category: input.category.trim().slice(0, 80),
      amount: new Prisma.Decimal(input.amount),
      contactId,
      reference: input.reference?.slice(0, 80) ?? null,
      notes:
        input.notes?.slice(0, 2000) ??
        `Created from Smart Capture · ${doc.name}`,
      status: "RECORDED",
    },
  });

  await db.document.update({
    where: { id: doc.id },
    data: {
      associatedEntityType: "Expense",
      associatedEntityId: created.id,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Expense",
    entityId: created.id,
    after: {
      source: "documents-smart-capture",
      documentId: doc.id,
      category: input.category,
      amount: input.amount,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/purchases/expenses");
  return { ok: true, expenseId: created.id };
}

// ───────────────────── DOC-D3.1: Inbox email actions ─────────────────────

/**
 * Fetch (or lazily generate) the per-org Smart Capture inbox email
 * address. Returns the full address or null when the operator hasn't
 * configured `INBOUND_EMAIL_DOMAIN` env (UI shows "Coming soon").
 */
export async function getInboxEmailForOrgAction(): Promise<{
  configured: boolean;
  email: string | null;
}> {
  const { organization } = await requireOrganization();
  const { getOrCreateInboxToken, buildInboxEmail } = await import(
    "@/lib/documents/inbox-token"
  );
  const token = await getOrCreateInboxToken(organization.id);
  const email = buildInboxEmail(token);
  return {
    configured: !!email,
    email,
  };
}

/**
 * Rotate the org's inbox token. Old email address stops resolving
 * immediately. UI should warn the user before triggering this.
 */
export async function rotateInboxEmailAction(): Promise<{
  ok: true;
  email: string | null;
}> {
  const { user, organization } = await requireOrganization();
  const { rotateInboxToken, buildInboxEmail } = await import(
    "@/lib/documents/inbox-token"
  );
  const token = await rotateInboxToken(organization.id);
  const email = buildInboxEmail(token);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Organization",
    entityId: organization.id,
    after: { rotatedInboxEmailToken: true },
  });
  revalidatePath("/documents");
  return { ok: true, email };
}
