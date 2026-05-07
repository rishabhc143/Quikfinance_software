"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { pingRazorpay } from "@/lib/sales/razorpay";

/**
 * M17b: Razorpay setup/test/disconnect server actions.
 *
 * Secrets are AES-256-GCM encrypted via lib/crypto.ts and never
 * decrypted to display in the UI. The webhook handler decrypts them
 * server-side only when a request arrives.
 */

const setupSchema = z.object({
  mode: z.enum(["test", "live"]).default("test"),
  keyId: z.string().min(8).max(80).regex(/^rzp_(test|live)_/),
  keySecret: z.string().min(8).max(120),
  webhookSecret: z.string().min(8).max(120),
  cardVerificationEnabled: z.boolean().optional(),
});
export type SetupRazorpayInput = z.input<typeof setupSchema>;

export async function setupRazorpayAction(
  input: SetupRazorpayInput
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = setupSchema.parse(input);

  const keySecretEncrypted = encryptSecret(data.keySecret);
  const webhookSecretEncrypted = encryptSecret(data.webhookSecret);

  await db.$transaction(async (tx) => {
    // Persist gateway config (upsert)
    await tx.paymentGatewayConfig.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        razorpayEnabled: true,
        razorpayKeyId: data.keyId,
        razorpayKeySecretEncrypted: keySecretEncrypted,
        razorpayWebhookSecretEncrypted: webhookSecretEncrypted,
        razorpayMode: data.mode,
        razorpayActivatedAt: new Date(),
        cardVerificationEnabled: data.cardVerificationEnabled ?? false,
      },
      update: {
        razorpayEnabled: true,
        razorpayKeyId: data.keyId,
        razorpayKeySecretEncrypted: keySecretEncrypted,
        razorpayWebhookSecretEncrypted: webhookSecretEncrypted,
        razorpayMode: data.mode,
        razorpayActivatedAt: new Date(),
      },
    });

    // Ensure a "Razorpay Clearing Account" BankAccount row exists. The
    // existing PaymentReceived.depositToAccountId points at BankAccount,
    // so this becomes the default deposit-to for Razorpay-sourced
    // payments created by the webhook.
    const existing = await tx.bankAccount.findFirst({
      where: {
        organizationId: organization.id,
        name: "Razorpay Clearing Account",
      },
      select: { id: true },
    });
    if (!existing) {
      await tx.bankAccount.create({
        data: {
          organizationId: organization.id,
          name: "Razorpay Clearing Account",
          accountType: "BANK",
          currency: organization.currency ?? "INR",
          isActive: true,
        },
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PaymentGatewayConfig",
    entityId: organization.id,
    after: { razorpayEnabled: true, mode: data.mode, keyId: data.keyId },
  });

  revalidatePath("/settings/online-payments/customer-payments");
  return { ok: true };
}

const testSchema = z.object({
  keyId: z.string().min(8).regex(/^rzp_(test|live)_/),
  keySecret: z.string().min(8),
});
export type TestRazorpayInput = z.input<typeof testSchema>;

export async function testRazorpayConnectionAction(
  input: TestRazorpayInput
): Promise<{ ok: boolean; error?: string }> {
  // No org guard required — the user is in their own dashboard, but
  // we still gate to ensure they're signed in.
  await requireOrganization();
  const data = testSchema.parse(input);
  const r = await pingRazorpay({ keyId: data.keyId, keySecret: data.keySecret });
  if (!r.ok) return { ok: false, error: r.error ?? "Connection failed" };
  return { ok: true };
}

export async function disconnectRazorpayAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { user, organization } = await requireOrganization();
  const cfg = await db.paymentGatewayConfig.findUnique({
    where: { organizationId: organization.id },
  });
  if (!cfg) return { ok: false, error: "Razorpay is not configured" };
  await db.paymentGatewayConfig.update({
    where: { organizationId: organization.id },
    data: { razorpayEnabled: false },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PaymentGatewayConfig",
    entityId: organization.id,
    after: { razorpayEnabled: false, disconnectedAt: new Date().toISOString() },
  });
  revalidatePath("/settings/online-payments/customer-payments");
  return { ok: true };
}

export async function updateCardVerificationSettingAction(
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  await db.paymentGatewayConfig.upsert({
    where: { organizationId: organization.id },
    create: {
      organizationId: organization.id,
      cardVerificationEnabled: enabled,
    },
    update: { cardVerificationEnabled: enabled },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PaymentGatewayConfig",
    entityId: organization.id,
    after: { cardVerificationEnabled: enabled },
  });
  revalidatePath("/settings/online-payments/customer-payments");
  return { ok: true };
}
