"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

/**
 * Mark a checklist item as completed manually.
 *
 * Items auto-complete when the underlying entity exists (count > 0),
 * but a user can also tick them by hand — e.g. "Add Organisation
 * Details" doesn't have a clean count check, so the user clicks
 * Mark as Completed when they're done.
 *
 * Idempotent: the unique index on (userId, orgId, itemKey) makes
 * double-clicks a no-op.
 */
export async function markChecklistItemAction(
  itemKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  try {
    await db.userChecklistProgress.upsert({
      where: {
        userId_organizationId_itemKey: {
          userId: user.id,
          organizationId: organization.id,
          itemKey,
        },
      },
      create: {
        userId: user.id,
        organizationId: organization.id,
        itemKey,
      },
      update: { completedAt: new Date() },
    });
  } catch (err) {
    console.error("[getting-started/mark] upsert failed", err);
    return {
      ok: false,
      error: "Couldn't save progress. Please try again.",
    };
  }
  revalidatePath("/getting-started");
  return { ok: true };
}

/**
 * Un-mark a previously-completed checklist item. Lets users revert
 * accidental clicks.
 */
export async function unmarkChecklistItemAction(
  itemKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  try {
    await db.userChecklistProgress.deleteMany({
      where: {
        userId: user.id,
        organizationId: organization.id,
        itemKey,
      },
    });
  } catch (err) {
    console.error("[getting-started/unmark] delete failed", err);
    return {
      ok: false,
      error: "Couldn't update progress. Please try again.",
    };
  }
  revalidatePath("/getting-started");
  return { ok: true };
}
