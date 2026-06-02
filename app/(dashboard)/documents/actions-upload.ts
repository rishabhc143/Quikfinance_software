"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { sha256Buffer, dupWarning } from "@/lib/documents/dedup";
import { extractPdfTextWithPassword } from "@/lib/documents/pdf-extract";
import { classifyDocument } from "@/lib/documents/document-classifier";
import {
  parseByDocumentType,
  type ParsedBankStatement,
  type ParsedBill,
  type ParsedReceipt,
} from "@/lib/documents/parsers";
import {
  parseBankStatementWithLLM,
  isLlmFallbackEnabled,
} from "@/lib/documents/parsers/llm-fallback";
import {
  buildBankStatementParseError,
  defaultParseErrorReason,
} from "@/lib/documents/parse-error";

const legacySchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  mimeType: z.string().max(80).optional().nullable(),
  folder: z.string().max(80).optional().nullable(),
});

/**
 * Legacy form-based document creation. Predates the multi-file upload
 * flow; kept for the `/documents/new` page which accepts a pre-uploaded
 * URL + name + folder via a plain form. Low traffic — most uploads
 * now go through `uploadDocumentsAction` (drag-drop in Files inbox)
 * or `uploadDocumentAction` (single-file in the legacy upload form).
 */
export async function createDocumentAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = legacySchema.parse({
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

// ───────────────────── DOC-D1.3: Multi-file upload + dedup ─────────────────────

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
 * Per-file: size + MIME guard → SHA-256 → dedup lookup → Vercel Blob
 * → Document row with `inbox = "FILES"` + Smart Capture pipeline.
 * Never throws — returns per-file results so UI can surface
 * success/duplicate/error feedback per row.
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

    let extractedText: string | null = null;
    let documentType: string | null = null;
    let extractedAt: Date | null = null;
    let extractedFields:
      | ParsedBankStatement
      | ParsedBill
      | ParsedReceipt
      | null = null;
    let needsPassword = false;
    if (file.type === "application/pdf") {
      try {
        const result = await extractPdfTextWithPassword(buffer);
        if (result.kind === "ok") {
          extractedText = result.text;
          const classification = classifyDocument(extractedText);
          documentType = classification.type;
          extractedFields = parseByDocumentType(extractedText, documentType);
          let parserSource: "heuristic" | "llm" | "manual" = "heuristic";
          const isBankStmtA = documentType === "BANK_STATEMENT";
          const heuristicEmptyA =
            !extractedFields ||
            ("rows" in extractedFields && extractedFields.rows.length === 0);
          const llmEnabledA = isLlmFallbackEnabled();
          if (isBankStmtA && heuristicEmptyA && llmEnabledA) {
            try {
              const llm = await parseBankStatementWithLLM(extractedText);
              if (llm && llm.rows.length > 0) {
                extractedFields = llm;
                parserSource = "llm";
              }
            } catch (err) {
              console.warn(
                "[documents/upload] LLM bank-statement fallback failed",
                err
              );
            }
          }
          // CRIT-4 Site 3: if BANK_STATEMENT and STILL empty after
          // heuristic+LLM, set a parseError sentinel so the drawer
          // can tell the user "we tried and couldn't" instead of
          // showing an empty table.
          const finalEmptyA =
            !extractedFields ||
            ("rows" in extractedFields && extractedFields.rows.length === 0);
          if (isBankStmtA && finalEmptyA) {
            extractedFields = buildBankStatementParseError(
              defaultParseErrorReason(llmEnabledA)
            );
          } else if (extractedFields && "rows" in extractedFields) {
            extractedFields = {
              ...extractedFields,
              _meta: { parserSource },
            } as ParsedBankStatement;
          }
        } else if (result.kind === "needs-password") {
          needsPassword = true;
        }
        extractedAt = new Date();
      } catch (err) {
        console.warn("[documents/upload] smart-capture extract failed", err);
      }
    }

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
        needsPassword,
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

// ───────────────────── BANK STATEMENTS INBOX: direct drop ─────────────────────

/**
 * Direct drag-drop action for the Bank Statements inbox. Forces
 * `inbox = "BANK_STATEMENTS"` + `documentType = "BANK_STATEMENT"`
 * regardless of classifier output (user explicitly chose this inbox).
 * Same dedup + MIME guards as the generic action.
 */
export async function uploadBankStatementsAction(
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
        message: `File type "${file.type}" is not allowed. Drop a PDF, image, or CSV/XLS export of your bank statement.`,
      });
      continue;
    }

    let buffer: Buffer;
    try {
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
    } catch (err) {
      console.error("[bank-statements/upload] failed to read buffer", err);
      results.push({
        fileName: file.name,
        status: "error",
        message: "Couldn't read the file. Try again.",
      });
      continue;
    }
    const fileHash = sha256Buffer(buffer);

    const existing = await db.document.findFirst({
      where: { organizationId: organization.id, fileHash, deletedAt: null },
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

    let extractedText: string | null = null;
    let extractedFields: ParsedBankStatement | null = null;
    let extractedAt: Date | null = null;
    let needsPassword = false;
    if (file.type === "application/pdf") {
      try {
        const result = await extractPdfTextWithPassword(buffer);
        if (result.kind === "ok") {
          extractedText = result.text;
          let parsedB = parseByDocumentType(extractedText, "BANK_STATEMENT");
          let parserSourceB: "heuristic" | "llm" | "manual" = "heuristic";
          const heuristicEmptyB =
            !parsedB ||
            ("rows" in parsedB && parsedB.rows.length === 0);
          const llmEnabledB = isLlmFallbackEnabled();
          if (heuristicEmptyB && llmEnabledB) {
            try {
              const llm = await parseBankStatementWithLLM(extractedText);
              if (llm && llm.rows.length > 0) {
                parsedB = llm;
                parserSourceB = "llm";
              }
            } catch (err) {
              console.warn(
                "[bank-statements/upload] LLM fallback failed",
                err
              );
            }
          }
          // CRIT-4 Site 3: error sentinel when both passes fail.
          const finalEmptyB =
            !parsedB ||
            ("rows" in parsedB && parsedB.rows.length === 0);
          if (finalEmptyB) {
            extractedFields = buildBankStatementParseError(
              defaultParseErrorReason(llmEnabledB)
            );
          } else if (parsedB && "rows" in parsedB) {
            extractedFields = {
              ...parsedB,
              _meta: { parserSource: parserSourceB },
            } as ParsedBankStatement;
          }
        } else if (result.kind === "needs-password") {
          needsPassword = true;
        }
        extractedAt = new Date();
      } catch (err) {
        console.warn(
          "[bank-statements/upload] smart-capture extract failed",
          err
        );
      }
    }

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
      console.error("[bank-statements/upload] vercel blob put failed", err);
      results.push({
        fileName: file.name,
        status: "error",
        message: "Upload failed. Check your connection and try again.",
      });
      continue;
    }

    const created = await db.document.create({
      data: {
        organizationId: organization.id,
        name: file.name,
        url: blobUrl,
        mimeType: file.type || null,
        sizeBytes: file.size,
        fileHash,
        inbox: "BANK_STATEMENTS",
        documentType: "BANK_STATEMENT",
        extractedText,
        extractedFields:
          extractedFields as unknown as Prisma.InputJsonValue,
        extractedAt,
        needsPassword,
        uploadedBy: user.id,
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
        source: "bank-statements-inbox-direct-drop",
        parsed: !!extractedFields,
        rowCount: extractedFields?.rows.length ?? 0,
      },
    });

    results.push({ fileName: file.name, status: "uploaded", id: created.id });
  }

  revalidatePath("/documents");
  const anyOk = results.some((r) => r.status === "uploaded");
  return { ok: anyOk, results };
}
