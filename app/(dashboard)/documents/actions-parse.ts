"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { extractPdfTextWithPassword } from "@/lib/documents/pdf-extract";
import { classifyDocument } from "@/lib/documents/document-classifier";
import {
  parseByDocumentType,
  type ParsedBankStatement,
} from "@/lib/documents/parsers";
import {
  parseBankStatementWithLLM,
  isLlmFallbackEnabled,
} from "@/lib/documents/parsers/llm-fallback";
import {
  buildBankStatementParseError,
  defaultParseErrorReason,
} from "@/lib/documents/parse-error";

// ───────────────────── DOC-D4.1: Password-protected PDF retry ─────────────────────

export async function retryExtractWithPasswordAction(input: {
  documentId: string;
  password: string;
}): Promise<{ ok: true; documentType: string | null } | { ok: false; error: string }> {
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
      url: true,
      mimeType: true,
      needsPassword: true,
    },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (doc.mimeType !== "application/pdf") {
    return { ok: false, error: "Only PDFs can be password-decrypted." };
  }
  if (!input.password || input.password.length < 1) {
    return { ok: false, error: "Password is required." };
  }

  let buffer: Buffer;
  try {
    const res = await fetch(doc.url);
    if (!res.ok) {
      return { ok: false, error: "Couldn't fetch the file from storage." };
    }
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  } catch (err) {
    console.error("[documents/retry-password] fetch failed", err);
    return { ok: false, error: "Couldn't fetch the file from storage." };
  }

  const result = await extractPdfTextWithPassword(buffer, input.password);
  if (result.kind === "needs-password") {
    return { ok: false, error: "Incorrect password. Try again." };
  }
  if (result.kind === "error") {
    return {
      ok: false,
      error: `Couldn't read the PDF: ${result.reason}`,
    };
  }

  const classification = classifyDocument(result.text);
  const documentType = classification.type;
  let extractedFields = parseByDocumentType(result.text, documentType);
  let parserSourceC: "heuristic" | "llm" | "manual" = "heuristic";
  const isBankStmtC = documentType === "BANK_STATEMENT";
  const heuristicEmptyC =
    !extractedFields ||
    ("rows" in extractedFields && extractedFields.rows.length === 0);
  const llmEnabledC = isLlmFallbackEnabled();
  if (isBankStmtC && heuristicEmptyC && llmEnabledC) {
    try {
      const llm = await parseBankStatementWithLLM(result.text, organization.id);
      if (llm && llm.rows.length > 0) {
        extractedFields = llm;
        parserSourceC = "llm";
      }
    } catch (err) {
      console.warn("[documents/retry-password] LLM fallback failed", err);
    }
  }
  // CRIT-4 Site 3: error sentinel when both passes fail.
  const finalEmptyC =
    !extractedFields ||
    ("rows" in extractedFields && extractedFields.rows.length === 0);
  if (isBankStmtC && finalEmptyC) {
    extractedFields = buildBankStatementParseError(
      defaultParseErrorReason(llmEnabledC)
    );
  } else if (extractedFields && "rows" in extractedFields) {
    extractedFields = {
      ...extractedFields,
      _meta: { parserSource: parserSourceC },
    } as ParsedBankStatement;
  }
  const inbox =
    documentType === "BANK_STATEMENT" ? "BANK_STATEMENTS" : undefined;

  await db.document.update({
    where: { id: doc.id },
    data: {
      extractedText: result.text,
      documentType,
      extractedAt: new Date(),
      needsPassword: false,
      ...(inbox ? { inbox } : {}),
      extractedFields:
        extractedFields as unknown as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Document",
    entityId: doc.id,
    after: {
      source: "password-retry",
      documentType,
      parserSource: parserSourceC,
      rowCount:
        extractedFields && "rows" in extractedFields
          ? extractedFields.rows.length
          : 0,
    },
  });

  revalidatePath("/documents");
  return { ok: true, documentType };
}

// ───────────────────── DOC-D4.4: LLM fallback actions ─────────────────────

export async function isLlmFallbackEnabledAction(): Promise<boolean> {
  return isLlmFallbackEnabled();
}

export async function retryParseWithLLMAction(input: {
  documentId: string;
}): Promise<{ ok: true; rowCount: number } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  if (!isLlmFallbackEnabled()) {
    return { ok: false, error: "AI fallback is not enabled on this deployment." };
  }

  const doc = await db.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      organizationId: true,
      documentType: true,
      extractedText: true,
      mimeType: true,
    },
  });

  if (!doc || doc.organizationId !== organization.id) {
    return { ok: false, error: "Document not found." };
  }
  if (doc.documentType !== "BANK_STATEMENT") {
    return { ok: false, error: "Only bank statement documents can use AI parsing." };
  }
  if (!doc.extractedText) {
    return { ok: false, error: "No extracted text available to send to AI." };
  }

  let llm: ParsedBankStatement | null = null;
  try {
    llm = await parseBankStatementWithLLM(doc.extractedText, organization.id);
  } catch (err) {
    console.warn("[documents/retry-llm] LLM fallback threw", err);
  }
  if (!llm || llm.rows.length === 0) {
    // CRIT-4 Site 3: record the failure on the document so the drawer
    // can show the user we tried (rather than the table just staying
    // empty silently).
    const sentinel = buildBankStatementParseError(
      defaultParseErrorReason(true)
    );
    await db.document.update({
      where: { id: doc.id },
      data: {
        extractedFields: sentinel as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath("/documents");
    return {
      ok: false,
      error:
        "AI couldn't extract rows from this document. The layout may be too unusual. Try uploading a CSV export instead.",
    };
  }

  const withMeta: ParsedBankStatement = {
    ...llm,
    _meta: { parserSource: "llm" },
  };

  await db.document.update({
    where: { id: doc.id },
    data: {
      extractedFields: withMeta as unknown as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Document",
    entityId: doc.id,
    after: { source: "llm-fallback-manual", rowCount: llm.rows.length },
  });

  revalidatePath("/documents");
  return { ok: true, rowCount: llm.rows.length };
}
