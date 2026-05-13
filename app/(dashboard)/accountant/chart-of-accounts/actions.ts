"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

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
  description: z.string().max(500).optional().nullable(),
});

function parseCreate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return createSchema.parse({
    code: raw.code || null,
    name: raw.name,
    type: raw.type,
    description: raw.description || null,
  });
}

function parseUpdate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return updateSchema.parse({
    code: raw.code || null,
    name: raw.name,
    description: raw.description || null,
  });
}

export async function createAccountAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parseCreate(formData);
  const created = await db.chartOfAccount.create({
    data: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "ChartOfAccount",
    entityId: created.id,
    after: { name: data.name, type: data.type },
  });
  revalidatePath("/accountant/chart-of-accounts");
  redirect("/accountant/chart-of-accounts");
}

/**
 * ACCT-A — Update name / code / description only. Type stays fixed.
 */
export async function updateAccountAction(id: string, formData: FormData) {
  const { user, organization } = await requireOrganization();
  const before = await db.chartOfAccount.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!before) throw new Error("Account not found");

  const data = parseUpdate(formData);

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

  await db.chartOfAccount.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      description: data.description,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "ChartOfAccount",
    entityId: id,
    before: { name: before.name, code: before.code },
    after: { name: data.name, code: data.code },
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
