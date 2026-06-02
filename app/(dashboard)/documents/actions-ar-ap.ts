"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import {
  isParsedBill,
  type ParsedBankStatement,
} from "@/lib/documents/parsers";

// ───────────────────── DOC-D2.2: Import bank statement to Banking ─────────────────────

export async function listBankAccountsForImportAction(): Promise<
  Array<{ id: string; label: string; last4: string | null }>
> {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, accountNumber: true },
    orderBy: { name: "asc" },
  });
  return accounts.map((a) => {
    const last4 =
      a.accountNumber && a.accountNumber.length >= 4
        ? a.accountNumber.slice(-4)
        : null;
    const masked = last4 ? `••••${last4}` : a.accountNumber ?? "";
    return {
      id: a.id,
      label: masked ? `${a.name} (${masked})` : a.name,
      last4,
    };
  });
}

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
        rowCount: 0,
        duplicateCount: 0,
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

export async function createBillFromDocumentAction(input: {
  documentId: string;
  vendorId: string;
  billNumber?: string;
  issueDate?: string;
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
    select: { id: true, name: true, documentType: true, extractedFields: true },
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

  let lineItemCount = 0;
  if (isParsedBill(doc.extractedFields) && doc.extractedFields.lineItems.length > 0) {
    const parsedItems = doc.extractedFields.lineItems;
    await db.billLineItem.createMany({
      data: parsedItems.map((item, idx) => ({
        billId: created.id,
        position: idx,
        name: item.description.slice(0, 200),
        description: item.description.slice(0, 500),
        hsnSacCode: item.hsn ?? null,
        quantity: new Prisma.Decimal(
          item.quantity != null && item.quantity > 0 ? item.quantity : 1
        ),
        rate: new Prisma.Decimal(
          item.rate != null && item.rate > 0 ? item.rate : item.amount
        ),
        amount: new Prisma.Decimal(item.amount),
        taxId: null,
        billableToCustomerId: null,
      })),
    });
    lineItemCount = parsedItems.length;
  }

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
      lineItemCount,
    },
  });

  revalidatePath("/documents");
  revalidatePath("/purchases/bills");
  return { ok: true, billId: created.id };
}

export async function createExpenseFromDocumentAction(input: {
  documentId: string;
  vendorId?: string;
  category: string;
  date?: string;
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
