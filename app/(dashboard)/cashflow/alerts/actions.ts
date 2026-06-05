"use server";

/**
 * CF-7 — Server actions for the anomaly-alert inbox.
 *
 * Dismissal flips status from "open" → "dismissed", records the
 * user + reason + timestamp, and writes an audit log row. The
 * partial unique index on (orgId, fingerprint) WHERE status='open'
 * means the next cron pass CAN re-emit the same anomaly if it
 * reappears — important because "I dismissed this last week" is
 * legitimately different from "I never want to see this again".
 *
 * NOTE: no `reopen` action in v1. If a user accidentally dismisses
 * and the underlying problem persists, the next cron will re-create
 * the alert (with a new id) within 24 hours.
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export type DismissAnomalyState = {
  ok: boolean;
  error?: string;
};

export async function dismissAnomalyAction(
  prevState: DismissAnomalyState,
  formData: FormData
): Promise<DismissAnomalyState> {
  const { organization, user } = await requireOrganization();

  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!id) return { ok: false, error: "Missing alert id." };

  // Org scope: only update alerts owned by this org. Without the
  // organizationId in the where clause, an attacker could pass an
  // id belonging to another tenant. Prisma's where clause + the
  // unique-on-id model means this updates 0 rows on mismatch
  // (silent failure, no leakage of "this id exists in another org").
  const existing = await db.anomalyAlert.findFirst({
    where: { id, organizationId: organization.id },
    select: { id: true, status: true, title: true },
  });
  if (!existing) {
    return { ok: false, error: "Alert not found." };
  }
  if (existing.status !== "open") {
    // Idempotent: dismissing an already-dismissed alert is a no-op
    // success, not an error. The most common cause is double-click.
    return { ok: true };
  }

  await db.anomalyAlert.update({
    where: { id: existing.id },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      dismissedById: user.id,
      dismissReason: reason || null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "AnomalyAlert",
    entityId: existing.id,
    before: { status: "open" },
    after: { status: "dismissed", reason: reason || null },
  });

  revalidatePath("/cashflow/alerts");
  return { ok: true };
}
