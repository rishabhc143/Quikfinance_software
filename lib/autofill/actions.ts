"use server";

import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * Server actions backing the `<HistoryInput>` autofill component.
 *
 * Two functions:
 *  - `fetchRecentValues(fieldKey)` — pulls the top 50 most-used + most-recent
 *    values for the given field key, scoped to the current organization.
 *    Called once on component mount; subsequent filtering happens client-side
 *    against this cached list (avoids a server roundtrip per keystroke).
 *  - `saveRecentValue(fieldKey, value)` — upserts the value into the
 *    `RecentValue` table on blur. Dedup'd by (org, fieldKey, value) at the
 *    SQL layer via the unique index; collisions just bump `useCount` and
 *    `lastUsedAt`.
 *
 * Both swallow errors silently — autofill is a UX nicety, never block a form
 * submission because the recent-values fetch hiccuped. The HistoryInput
 * component wraps both in `.catch(() => {})`.
 */

const MIN_VALUE_LENGTH = 2;
const MAX_VALUE_LENGTH = 200;
const TOP_N = 50;

export async function fetchRecentValues(fieldKey: string): Promise<string[]> {
  if (!fieldKey || typeof fieldKey !== "string") return [];
  try {
    const { organization } = await requireOrganization();
    const rows = await db.recentValue.findMany({
      where: { organizationId: organization.id, fieldKey },
      orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
      take: TOP_N,
      select: { value: true },
    });
    return rows.map((r) => r.value);
  } catch {
    return [];
  }
}

export async function saveRecentValue(
  fieldKey: string,
  value: string,
): Promise<void> {
  if (!fieldKey || typeof fieldKey !== "string") return;
  const trimmed = (value ?? "").trim();
  if (
    trimmed.length < MIN_VALUE_LENGTH ||
    trimmed.length > MAX_VALUE_LENGTH
  ) {
    return;
  }
  try {
    const { organization } = await requireOrganization();
    await db.recentValue.upsert({
      where: {
        organizationId_fieldKey_value: {
          organizationId: organization.id,
          fieldKey,
          value: trimmed,
        },
      },
      create: {
        organizationId: organization.id,
        fieldKey,
        value: trimmed,
      },
      update: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  } catch {
    // intentional: autofill is a UX nicety, swallow errors.
  }
}
