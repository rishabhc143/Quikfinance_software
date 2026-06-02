"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * DOC-D1.4: Soft-delete a single document (move to Trash). Replaces
 * the prior hard-delete pattern. Hard delete is now `purgeDocumentAction`
 * and is reserved for the Trash view.
 */
export async function deleteDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!d) return { ok: false, error: "Document not found." };
  await db.document.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Document",
    entityId: id,
    before: { name: d.name },
    after: { trashed: true },
  });
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * DOC-D1.4: Restore a soft-deleted document from Trash. Clears
 * `deletedAt` and revalidates the documents page.
 */
export async function restoreDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: {
      id,
      organizationId: organization.id,
      deletedAt: { not: null },
    },
  });
  if (!d) return { ok: false, error: "Document not found in Trash." };
  await db.document.update({
    where: { id },
    data: { deletedAt: null },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Document",
    entityId: id,
    before: { trashed: true },
    after: { restored: true },
  });
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * DOC-D1.4: Permanently delete a document from Trash. Removes the
 * DB row AND the underlying Vercel Blob (if a token is configured).
 *
 * Refuses to purge a document that isn't already in Trash — protects
 * against accidental data loss from the All Documents view.
 *
 * Blob deletion failures don't abort the purge — the DB row goes
 * either way (orphaned blobs are cheap to clean up later via the
 * Vercel dashboard).
 */
export async function purgeDocumentAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({
    where: {
      id,
      organizationId: organization.id,
      deletedAt: { not: null },
    },
  });
  if (!d) {
    return {
      ok: false,
      error:
        "Only documents already in Trash can be permanently deleted. Move it to Trash first.",
    };
  }

  // Best-effort blob deletion. The dynamic import keeps `@vercel/blob`
  // out of the bundle for paths that don't need it.
  if (process.env.BLOB_READ_WRITE_TOKEN && d.url) {
    try {
      const { del } = await import("@vercel/blob");
      await del(d.url);
    } catch (err) {
      console.warn("[documents/purge] Vercel Blob delete failed", err);
    }
  }

  await db.document.delete({ where: { id } });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Document",
    entityId: id,
    before: { name: d.name, url: d.url, trashed: true },
    after: { purged: true },
  });

  revalidatePath("/documents");
  return { ok: true };
}
