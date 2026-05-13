"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * BNK-E — CRUD + toggle for Transaction Rules.
 *
 * Action set kept small and focused:
 *   createRuleAction       — wraps the form payload
 *   updateRuleAction       — same shape, requires id
 *   deleteRuleAction       — hard delete (rules carry no books-of-record
 *                            data, so soft-delete adds no value)
 *   toggleRuleActiveAction — flips isActive without going through the form
 */

const conditionSchema = z.object({
  field: z.enum(["DESCRIPTION", "REFERENCE", "AMOUNT"]),
  op: z.enum([
    "CONTAINS",
    "STARTS_WITH",
    "EQUALS",
    "IS_EMPTY",
    "EQ",
    "GT",
    "LT",
    "GTE",
    "LTE",
  ]),
  value: z.string().max(200),
});

const ruleSchema = z.object({
  name: z.string().min(1).max(120),
  bankAccountId: z.string().nullable(),
  priority: z.coerce.number().int().min(0).max(9999).default(100),
  isActive: z.coerce.boolean().default(true),
  conditions: z.array(conditionSchema).min(1).max(10),
  combinator: z.enum(["AND", "OR"]).default("AND"),
  actionGlAccountId: z.string().min(1),
  actionNotes: z.string().max(500).nullable().optional(),
});

export type RuleInput = z.input<typeof ruleSchema>;

async function verifyScopes(
  organizationId: string,
  bankAccountId: string | null,
  glAccountId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bankAccountId) {
    const account = await db.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
      select: { id: true },
    });
    if (!account) return { ok: false, error: "Bank account not found in this org." };
  }
  const gl = await db.chartOfAccount.findFirst({
    where: { id: glAccountId, organizationId, isActive: true },
    select: { id: true },
  });
  if (!gl) return { ok: false, error: "GL account not found in this org." };
  return { ok: true };
}

export async function createRuleAction(
  input: RuleInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = ruleSchema.parse(input);

  const scopeCheck = await verifyScopes(
    organization.id,
    data.bankAccountId,
    data.actionGlAccountId
  );
  if (!scopeCheck.ok) return { ok: false, error: scopeCheck.error };

  const created = await db.bankRule.create({
    data: {
      organizationId: organization.id,
      bankAccountId: data.bankAccountId,
      name: data.name,
      priority: data.priority,
      isActive: data.isActive,
      conditionsJson: data.conditions as unknown as object,
      combinator: data.combinator,
      actionGlAccountId: data.actionGlAccountId,
      actionNotes: data.actionNotes ?? null,
    },
    select: { id: true },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "BankRule",
    entityId: created.id,
    after: { name: data.name, conditions: data.conditions.length },
  });

  revalidatePath("/banking/rules");
  return { ok: true, id: created.id };
}

export async function updateRuleAction(
  id: string,
  input: RuleInput
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const existing = await db.bankRule.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!existing) return { ok: false, error: "Rule not found in this org." };

  const data = ruleSchema.parse(input);

  const scopeCheck = await verifyScopes(
    organization.id,
    data.bankAccountId,
    data.actionGlAccountId
  );
  if (!scopeCheck.ok) return { ok: false, error: scopeCheck.error };

  await db.bankRule.update({
    where: { id },
    data: {
      name: data.name,
      bankAccountId: data.bankAccountId,
      priority: data.priority,
      isActive: data.isActive,
      conditionsJson: data.conditions as unknown as object,
      combinator: data.combinator,
      actionGlAccountId: data.actionGlAccountId,
      actionNotes: data.actionNotes ?? null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankRule",
    entityId: id,
    before: { name: existing.name, priority: existing.priority, isActive: existing.isActive },
    after: { name: data.name, priority: data.priority, isActive: data.isActive },
  });

  revalidatePath("/banking/rules");
  return { ok: true };
}

export async function deleteRuleAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const rule = await db.bankRule.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!rule) throw new Error("Rule not found in this org.");

  await db.bankRule.delete({ where: { id } });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "BankRule",
    entityId: id,
    before: { name: rule.name },
  });

  revalidatePath("/banking/rules");
}

export async function toggleRuleActiveAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const rule = await db.bankRule.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!rule) throw new Error("Rule not found in this org.");

  const next = !rule.isActive;
  await db.bankRule.update({
    where: { id },
    data: { isActive: next },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "BankRule",
    entityId: id,
    before: { isActive: rule.isActive },
    after: { isActive: next },
  });

  revalidatePath("/banking/rules");
}

/** Bind-friendly delete wrapper for <ActionFormButton>. */
export async function deleteRuleByIdAction(id: string): Promise<void> {
  await deleteRuleAction(id);
}

/** Bind-friendly toggle wrapper for <ActionFormButton>. */
export async function toggleRuleByIdAction(id: string): Promise<void> {
  await toggleRuleActiveAction(id);
}

/** Helper used after the form save to navigate back to the list. */
export async function createRuleAndRedirectAction(input: RuleInput): Promise<void> {
  const res = await createRuleAction(input);
  if (!res.ok) throw new Error(res.error ?? "Create failed");
  redirect("/banking/rules");
}

export async function updateRuleAndRedirectAction(
  id: string,
  input: RuleInput
): Promise<void> {
  const res = await updateRuleAction(id, input);
  if (!res.ok) throw new Error(res.error ?? "Update failed");
  redirect("/banking/rules");
}
