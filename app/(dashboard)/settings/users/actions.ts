"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { sendEmail, EmailSendError } from "@/lib/email";
import type { Role } from "@prisma/client";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "STAFF", "ACCOUNTANT", "VIEWER"]),
});

export async function inviteUserAction(input: z.input<typeof inviteSchema>) {
  const { user: me, organization, membership } = await requireOrganization();
  if (membership.role !== "ADMIN") throw new Error("Only admins can invite users");
  const { email, role } = inviteSchema.parse(input);

  const existing = await db.user.findUnique({ where: { email } });

  if (existing) {
    const already = await db.organizationMembership.findUnique({
      where: { userId_organizationId: { userId: existing.id, organizationId: organization.id } },
    });
    if (already) throw new Error("That user is already a member.");
    const created = await db.organizationMembership.create({
      data: { userId: existing.id, organizationId: organization.id, role: role as Role },
    });
    await writeAuditLog({
      organizationId: organization.id, userId: me.id,
      action: "CREATE", entityType: "OrganizationMembership", entityId: created.id,
      after: { email, role },
    });
    revalidatePath("/settings/users");
    return { ok: true, invited: false };
  }

  // No account yet: create a placeholder + verification token + email
  const placeholder = await db.user.create({
    data: {
      email,
      passwordHash: null, // they'll set on first sign-in flow
    },
  });
  await db.organizationMembership.create({
    data: { userId: placeholder.id, organizationId: organization.id, role: role as Role },
  });
  const token = crypto.randomBytes(32).toString("hex");
  await db.emailVerificationToken.create({
    data: { userId: placeholder.id, token, expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/signup?email=${encodeURIComponent(email)}&invite=${token}`;

  // If the email send fails (e.g. unverified domain, rate limit,
  // bad EMAIL_FROM), we want the admin to know — surfacing a
  // proper error instead of silently saying "Invitation sent".
  // The placeholder user + membership + token rows stay behind
  // so a retry just re-sends the same valid link.
  try {
    await sendEmail({
      to: email,
      subject: `${me.name ?? me.email} invited you to ${organization.name} on Quikfinance`,
      html: `<p>${me.name ?? me.email} invited you to join <strong>${organization.name}</strong> on Quikfinance.</p>
<p><a href="${link}">Accept invitation and create your account</a></p>
<p>This link expires in 7 days.</p>`,
    });
  } catch (err) {
    if (err instanceof EmailSendError) {
      console.error("[invite] sendEmail failed for", email, err.message);
      throw new Error(
        `Invitation created, but the email failed to send: ${err.message}. Try again, or contact support if it keeps failing.`
      );
    }
    throw err;
  }

  await writeAuditLog({
    organizationId: organization.id, userId: me.id,
    action: "CREATE", entityType: "Invitation", entityId: placeholder.id,
    after: { email, role },
  });
  revalidatePath("/settings/users");
  return { ok: true, invited: true };
}

export async function changeRoleAction(membershipId: string, role: Role) {
  const { user: me, organization, membership } = await requireOrganization();
  if (membership.role !== "ADMIN") throw new Error("Only admins can change roles");

  const target = await db.organizationMembership.findFirst({ where: { id: membershipId, organizationId: organization.id } });
  if (!target) throw new Error("Member not found");
  if (target.userId === me.id && role !== "ADMIN") throw new Error("You cannot demote yourself");

  await db.organizationMembership.update({ where: { id: membershipId }, data: { role } });
  await writeAuditLog({
    organizationId: organization.id, userId: me.id,
    action: "UPDATE", entityType: "OrganizationMembership", entityId: membershipId,
    before: { role: target.role }, after: { role },
  });
  revalidatePath("/settings/users");
  return { ok: true };
}

export async function removeMemberAction(membershipId: string) {
  const { user: me, organization, membership } = await requireOrganization();
  if (membership.role !== "ADMIN") throw new Error("Only admins can remove members");

  const target = await db.organizationMembership.findFirst({ where: { id: membershipId, organizationId: organization.id } });
  if (!target) throw new Error("Member not found");
  if (target.userId === me.id) throw new Error("You cannot remove yourself. Ask another admin.");

  await db.organizationMembership.delete({ where: { id: membershipId } });
  await writeAuditLog({
    organizationId: organization.id, userId: me.id,
    action: "DELETE", entityType: "OrganizationMembership", entityId: membershipId,
    before: { userId: target.userId, role: target.role },
  });
  revalidatePath("/settings/users");
  return { ok: true };
}
