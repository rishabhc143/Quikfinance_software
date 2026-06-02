"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

// ───────────────────── DOC-D4.2: Edit parsed bank statement ─────────────────────

export async function updateParsedBankStatementAction(input: {
  documentId: string;
  rows: Array<{
    date: string;
    description: string;
    debit?: number | null;
    credit?: number | null;
    balance?: number | null;
  }>;
}): Promise<
  | { ok: true; rowCount: number }
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
      documentType: true,
      extractedFields: true,
    },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (doc.documentType !== "BANK_STATEMENT") {
    return { ok: false, error: "Only bank statements can be edited here." };
  }

  const cleaned: Array<{
    date: string;
    description: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }> = [];
  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      return {
        ok: false,
        error: `Row ${i + 1}: date must be in YYYY-MM-DD format.`,
      };
    }
    const debit = typeof r.debit === "number" && r.debit > 0 ? r.debit : undefined;
    const credit = typeof r.credit === "number" && r.credit > 0 ? r.credit : undefined;
    if (debit == null && credit == null) {
      return {
        ok: false,
        error: `Row ${i + 1}: must have either Debit or Credit.`,
      };
    }
    if (debit != null && credit != null) {
      return {
        ok: false,
        error: `Row ${i + 1}: can't have both Debit and Credit on the same row.`,
      };
    }
    cleaned.push({
      date: r.date,
      description: (r.description || "").slice(0, 500),
      ...(debit != null ? { debit } : {}),
      ...(credit != null ? { credit } : {}),
      ...(typeof r.balance === "number" && !Number.isNaN(r.balance)
        ? { balance: r.balance }
        : {}),
    });
  }

  const existing = (doc.extractedFields ?? {}) as Record<string, unknown>;
  const updated = {
    ...existing,
    rows: cleaned,
  };

  await db.document.update({
    where: { id: doc.id },
    data: {
      extractedFields: updated as unknown as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Document",
    entityId: doc.id,
    after: {
      source: "parsed-bank-statement-edit",
      rowCount: cleaned.length,
    },
  });

  revalidatePath("/documents");
  return { ok: true, rowCount: cleaned.length };
}

// ───────────────────── DOC-D4.3: Match bank rows to AR / AP ─────────────────────

export async function getBankRowMatchesAction(input: {
  documentId: string;
}): Promise<
  | { ok: true; matches: import("@/lib/documents/match-bank-transactions").SuggestedMatch[] }
  | { ok: false; error: string }
> {
  const { organization } = await requireOrganization();

  const doc = await db.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { documentType: true, extractedFields: true },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (doc.documentType !== "BANK_STATEMENT") {
    return { ok: false, error: "Only bank statements can be matched." };
  }

  const ef = doc.extractedFields as unknown as { rows?: unknown };
  if (!ef || !Array.isArray(ef.rows)) {
    return { ok: true, matches: [] };
  }

  const rows = (ef.rows as Array<Record<string, unknown>>).map((r) => ({
    date: typeof r.date === "string" ? r.date : "",
    description: typeof r.description === "string" ? r.description : "",
    credit: typeof r.credit === "number" ? r.credit : null,
    debit: typeof r.debit === "number" ? r.debit : null,
  }));

  const { suggestMatchesForBankRows } = await import(
    "@/lib/documents/match-bank-transactions"
  );
  const matches = await suggestMatchesForBankRows({
    organizationId: organization.id,
    rows,
  });

  return { ok: true, matches };
}
