"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { isValidSubTypeForType } from "@/lib/accounting/coa-subtypes";
import { partitionForBulkArchive } from "@/lib/accounting/coa-bulk";

const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
  "COST_OF_GOODS_SOLD",
  "OTHER_INCOME",
  "OTHER_EXPENSE",
] as const;

const createSchema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  subType: z.string().max(80).optional().nullable(),
  parentId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

/**
 * ACCT-A — `type` is deliberately NOT in this schema. Changing the type
 * on an existing account would silently break every JE and every
 * report that joins through it.
 */
const updateSchema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1).max(120),
  subType: z.string().max(80).optional().nullable(),
  parentId: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

function parseCreate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return createSchema.parse({
    code: raw.code || null,
    name: raw.name,
    type: raw.type,
    subType: raw.subType || null,
    parentId: raw.parentId || null,
    description: raw.description || null,
  });
}

function parseUpdate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return updateSchema.parse({
    code: raw.code || null,
    name: raw.name,
    subType: raw.subType || null,
    parentId: raw.parentId || null,
    description: raw.description || null,
  });
}

export async function createAccountAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parseCreate(formData);

  if (!isValidSubTypeForType(data.type, data.subType ?? null)) {
    throw new Error(
      `Sub-type "${data.subType}" isn't valid for type ${data.type}.`
    );
  }
  // Verify the parent (if set) belongs to this org AND shares the
  // same broad type — a "Cash" sub-account can't have an EXPENSE
  // parent.
  if (data.parentId) {
    const parent = await db.chartOfAccount.findFirst({
      where: { id: data.parentId, organizationId: organization.id },
      select: { id: true, type: true },
    });
    if (!parent) throw new Error("Parent account not found in this org.");
    if (parent.type !== data.type) {
      throw new Error(
        `Parent account is ${parent.type}; can't nest a ${data.type} under it.`
      );
    }
  }

  const created = await db.chartOfAccount.create({
    data: {
      organizationId: organization.id,
      code: data.code,
      name: data.name,
      type: data.type,
      subType: data.subType ?? null,
      parentId: data.parentId ?? null,
      description: data.description,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ChartOfAccount",
    entityId: created.id,
    after: { name: data.name, type: data.type, subType: data.subType },
  });
  revalidatePath("/accountant/chart-of-accounts");
  redirect("/accountant/chart-of-accounts");
}

/**
 * ACCT-A — Update name / code / subType / parent / description.
 * Type stays fixed.
 */
export async function updateAccountAction(id: string, formData: FormData) {
  const { user, organization } = await requireOrganization();
  const before = await db.chartOfAccount.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!before) throw new Error("Account not found");

  const data = parseUpdate(formData);

  if (!isValidSubTypeForType(before.type, data.subType ?? null)) {
    throw new Error(
      `Sub-type "${data.subType}" isn't valid for type ${before.type}.`
    );
  }

  // Code is unique per org. If the user is changing it, surface the
  // conflict cleanly rather than letting the unique-violation explode.
  if (data.code && data.code !== before.code) {
    const conflict = await db.chartOfAccount.findFirst({
      where: {
        organizationId: organization.id,
        code: data.code,
        id: { not: id },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new Error(`Code "${data.code}" is already in use by another account.`);
    }
  }

  // Parent must (a) belong to this org, (b) share the same type as
  // the account being edited, and (c) NOT be this account itself
  // (to avoid creating a 1-cycle in the hierarchy).
  if (data.parentId) {
    if (data.parentId === id) {
      throw new Error("An account can't be its own parent.");
    }
    const parent = await db.chartOfAccount.findFirst({
      where: { id: data.parentId, organizationId: organization.id },
      select: { id: true, type: true },
    });
    if (!parent) throw new Error("Parent account not found in this org.");
    if (parent.type !== before.type) {
      throw new Error(
        `Parent account is ${parent.type}; can't nest a ${before.type} under it.`
      );
    }
  }

  await db.chartOfAccount.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      subType: data.subType ?? null,
      parentId: data.parentId ?? null,
      description: data.description,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ChartOfAccount",
    entityId: id,
    before: { name: before.name, code: before.code, subType: before.subType },
    after: { name: data.name, code: data.code, subType: data.subType },
  });

  revalidatePath("/accountant/chart-of-accounts");
  redirect("/accountant/chart-of-accounts");
}

/**
 * ACCT-A — Toggle isActive. System accounts (code prefixed `SYS-`)
 * cannot be archived because domain code (BNK-D Categorise, RPT-B
 * post-helpers) lazy-creates and depends on them.
 */
export async function setAccountActiveAction(id: string, isActive: boolean) {
  const { user, organization } = await requireOrganization();
  const a = await db.chartOfAccount.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!a) return { ok: false, error: "Account not found" };
  if (!isActive && a.code?.startsWith("SYS-")) {
    return {
      ok: false,
      error:
        "System accounts (SYS-*) can't be archived — they're used by automatic posting code.",
    };
  }
  await db.chartOfAccount.update({ where: { id }, data: { isActive } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ChartOfAccount",
    entityId: id,
    after: { isActive },
  });
  revalidatePath("/accountant/chart-of-accounts");
  return { ok: true };
}

/** Bind-friendly wrapper — archives via <ActionFormButton>. */
export async function archiveAccountByIdAction(id: string): Promise<void> {
  const res = await setAccountActiveAction(id, false);
  if (!res.ok) throw new Error(res.error ?? "Archive failed");
}

/** Bind-friendly wrapper — restores an archived account. */
export async function restoreAccountByIdAction(id: string): Promise<void> {
  const res = await setAccountActiveAction(id, true);
  if (!res.ok) throw new Error(res.error ?? "Restore failed");
}

// ──────────────────── ACCT-E.2: bulk actions ────────────────────

type BulkResult = {
  ok: boolean;
  changed: number;
  refused: number;
  error?: string;
};

/**
 * Bulk-archive a list of account ids. Silently skips any SYS-*
 * accounts in the list (returns them in the `refused` count) so
 * the user gets a clear "n archived, m skipped (system)" toast
 * instead of an opaque failure.
 */
export async function bulkArchiveAccountsAction(
  ids: string[]
): Promise<BulkResult> {
  const { user, organization } = await requireOrganization();
  if (ids.length === 0) {
    return { ok: false, changed: 0, refused: 0, error: "No accounts selected." };
  }
  const rows = await db.chartOfAccount.findMany({
    where: {
      id: { in: ids },
      organizationId: organization.id,
      isActive: true,
    },
    select: { id: true, code: true },
  });
  const { allowed, refused } = partitionForBulkArchive(rows);
  if (allowed.length === 0) {
    return {
      ok: false,
      changed: 0,
      refused: refused.length,
      error: "Selection is all system accounts — none can be archived.",
    };
  }
  const res = await db.chartOfAccount.updateMany({
    where: { id: { in: allowed }, organizationId: organization.id },
    data: { isActive: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ChartOfAccount",
    entityId: "bulk-archive",
    after: { archived: res.count, refused: refused.length },
  });
  revalidatePath("/accountant/chart-of-accounts");
  return { ok: true, changed: res.count, refused: refused.length };
}

/**
 * Bulk-restore a list of archived account ids. No SYS-* guard
 * needed (restoring a system account is harmless).
 */
export async function bulkRestoreAccountsAction(
  ids: string[]
): Promise<BulkResult> {
  const { user, organization } = await requireOrganization();
  if (ids.length === 0) {
    return { ok: false, changed: 0, refused: 0, error: "No accounts selected." };
  }
  const res = await db.chartOfAccount.updateMany({
    where: {
      id: { in: ids },
      organizationId: organization.id,
      isActive: false,
    },
    data: { isActive: true },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ChartOfAccount",
    entityId: "bulk-restore",
    after: { restored: res.count },
  });
  revalidatePath("/accountant/chart-of-accounts");
  return { ok: true, changed: res.count, refused: 0 };
}
