"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { recordPaymentAction } from "../invoices/actions";
import type { RecordPaymentInput } from "@/lib/validations/invoice";

/**
 * Record a payment from the Payments Received page (vs from inside an
 * invoice). Server logic is shared with invoices/actions.recordPaymentAction.
 */
export async function recordStandalonePaymentAction(input: RecordPaymentInput) {
  await recordPaymentAction(input);
}

export async function deletePaymentReceivedAction(id: string) {
  const { user, organization } = await requireOrganization();
  const p = await db.paymentReceived.findFirst({
    where: { id, organizationId: organization.id },
    include: { allocations: true },
  });
  if (!p) return { ok: false };
  if (p.allocations.length > 0) {
    return { ok: false, error: "Cannot delete payments with allocations" };
  }
  await db.paymentReceived.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentReceived",
    entityId: id,
    before: { number: p.number },
  });
  revalidatePath("/sales/payments-received");
  return { ok: true };
}
