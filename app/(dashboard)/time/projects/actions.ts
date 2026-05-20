"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { BILLING_METHOD_VALUES } from "./constants";

const taskSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().default(""),
  billable: z.coerce.boolean().default(true),
});

/**
 * Schema for the New Project form. The client posts JSON-encoded
 * `tasks` and `userIds` strings since FormData can't carry arrays
 * cleanly; we parse them here.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  projectCode: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
  customerId: z.string().min(1, "Customer is required"),
  billingMethod: z.enum(BILLING_METHOD_VALUES),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
  costBudget: z.coerce.number().nonnegative().optional().nullable(),
  revenueBudget: z.coerce.number().nonnegative().optional().nullable(),
  userIds: z.array(z.string()).default([]),
  tasks: z.array(taskSchema).default([]),
  addToWatchlist: z.coerce.boolean().default(false),
});

function parseCreate(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const userIds =
    typeof raw.userIds === "string" && raw.userIds.trim().startsWith("[")
      ? (JSON.parse(raw.userIds as string) as string[])
      : [];
  const tasks =
    typeof raw.tasks === "string" && raw.tasks.trim().startsWith("[")
      ? (JSON.parse(raw.tasks as string) as Array<{
          name: string;
          description?: string;
          billable?: boolean;
        }>)
      : [];

  return createSchema.parse({
    name: raw.name,
    projectCode: raw.projectCode,
    customerId: raw.customerId,
    billingMethod: raw.billingMethod,
    description: raw.description,
    costBudget: raw.costBudget === "" ? null : raw.costBudget,
    revenueBudget: raw.revenueBudget === "" ? null : raw.revenueBudget,
    userIds,
    tasks,
    addToWatchlist: raw.addToWatchlist === "on" || raw.addToWatchlist === "true",
  });
}

export async function createProjectAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parseCreate(formData);

  // Verify the customer belongs to this org.
  const customer = await db.contact.findFirst({
    where: { id: data.customerId, organizationId: organization.id, deletedAt: null },
    select: { id: true },
  });
  if (!customer) throw new Error("Customer not found in this organization.");

  // Verify any user IDs belong to the org via OrganizationMembership.
  const memberIds = new Set<string>([user.id]); // creator is always a member
  if (data.userIds.length > 0) {
    const memberships = await db.organizationMembership.findMany({
      where: {
        organizationId: organization.id,
        userId: { in: data.userIds },
      },
      select: { userId: true },
    });
    for (const m of memberships) memberIds.add(m.userId);
  }

  const created = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: organization.id,
        name: data.name,
        projectCode: data.projectCode ?? null,
        customerId: data.customerId,
        billingMethod: data.billingMethod,
        description: data.description ?? null,
        budget: data.costBudget ?? null,
        revenueBudget: data.revenueBudget ?? null,
        watchedByUserIds: data.addToWatchlist ? [user.id] : [],
      },
    });

    if (data.tasks.length > 0) {
      await tx.task.createMany({
        data: data.tasks.map((t, i) => ({
          organizationId: organization.id,
          projectId: project.id,
          name: t.name,
          description: t.description?.trim() ? t.description.trim() : null,
          billable: t.billable ?? true,
          sortOrder: i,
        })),
      });
    }

    if (memberIds.size > 0) {
      await tx.projectUser.createMany({
        data: Array.from(memberIds).map((uid) => ({
          organizationId: organization.id,
          projectId: project.id,
          userId: uid,
        })),
        skipDuplicates: true,
      });
    }

    return project;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Project",
    entityId: created.id,
    after: {
      name: data.name,
      billingMethod: data.billingMethod,
      taskCount: data.tasks.length,
      userCount: memberIds.size,
    },
  });

  revalidatePath("/time/projects");
  redirect(`/time/projects/${created.id}`);
}

export async function deleteProjectAction(id: string) {
  const { user, organization } = await requireOrganization();
  const p = await db.project.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!p) return { ok: false };
  await db.project.delete({ where: { id } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Project",
    entityId: id,
    before: { name: p.name },
  });
  revalidatePath("/time/projects");
  return { ok: true };
}
