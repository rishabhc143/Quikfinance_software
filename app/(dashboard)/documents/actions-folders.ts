"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { collectDescendantIds } from "@/lib/documents/folder-tree";

// ───────────────────── DOC-D1.2: Folder CRUD ─────────────────────
//
// Folder operations are org-scoped + cascade soft-delete (deleting a
// parent marks every descendant as deleted in one transaction). Tree
// walks use the pure `collectDescendantIds` helper so the logic is
// covered by the unit tests in `folder-tree.test.ts`.

const folderNameSchema = z
  .string()
  .min(1, "Folder name is required")
  .max(120, "Folder name is too long");

/**
 * Create a new folder. If `parentFolderId` is set, validates the
 * parent exists in the same org. Names within a parent are NOT forced
 * unique (matches Zoho — duplicates are allowed since folders are
 * disambiguated by path).
 */
export async function createFolderAction(input: {
  name: string;
  parentFolderId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const parsed = folderNameSchema.safeParse(input.name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.trim();

  if (input.parentFolderId) {
    const parent = await db.documentFolder.findFirst({
      where: {
        id: input.parentFolderId,
        organizationId: organization.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!parent) {
      return { ok: false, error: "Parent folder not found." };
    }
  }

  const created = await db.documentFolder.create({
    data: {
      organizationId: organization.id,
      name,
      parentFolderId: input.parentFolderId || null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "DocumentFolder",
    entityId: created.id,
    after: { name, parentFolderId: input.parentFolderId ?? null },
  });

  revalidatePath("/documents");
  return { ok: true, id: created.id };
}

/**
 * Rename a folder. No-op if the new name matches the current one.
 */
export async function renameFolderAction(input: {
  folderId: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();
  const parsed = folderNameSchema.safeParse(input.name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const name = parsed.data.trim();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: input.folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };
  if (folder.name === name) return { ok: true };

  await db.documentFolder.update({
    where: { id: folder.id },
    data: { name },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { name: folder.name },
    after: { name },
  });

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Move a folder under a different parent (or to root with null).
 * Refuses to move a folder into itself or any of its descendants —
 * that would create a cycle. Uses `collectDescendantIds` to scan.
 */
export async function moveFolderAction(input: {
  folderId: string;
  newParentFolderId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: input.folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, parentFolderId: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  // Same parent → no-op, exit early.
  if ((folder.parentFolderId ?? null) === (input.newParentFolderId ?? null)) {
    return { ok: true };
  }

  if (input.newParentFolderId) {
    if (input.newParentFolderId === folder.id) {
      return { ok: false, error: "A folder cannot be its own parent." };
    }
    const newParent = await db.documentFolder.findFirst({
      where: {
        id: input.newParentFolderId,
        organizationId: organization.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!newParent) {
      return { ok: false, error: "Target parent not found." };
    }

    // Cycle check: refuse to move under a descendant.
    const allFolders = await db.documentFolder.findMany({
      where: { organizationId: organization.id, deletedAt: null },
      select: { id: true, name: true, parentFolderId: true },
    });
    const descendants = collectDescendantIds(folder.id, allFolders);
    if (descendants.includes(input.newParentFolderId)) {
      return {
        ok: false,
        error: "Cannot move a folder into one of its own subfolders.",
      };
    }
  }

  await db.documentFolder.update({
    where: { id: folder.id },
    data: { parentFolderId: input.newParentFolderId || null },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { parentFolderId: folder.parentFolderId },
    after: { parentFolderId: input.newParentFolderId ?? null },
  });

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Soft-delete a folder + every descendant in one transaction. Any
 * documents inside those folders are also soft-deleted so the user
 * can restore everything together from Trash later (PR D1.4 wires
 * Restore). Hard purge stays a Trash-only action.
 */
export async function softDeleteFolderAction(
  folderId: string
): Promise<{ ok: true; deletedCount: number } | { ok: false; error: string }> {
  const { user, organization } = await requireOrganization();

  const folder = await db.documentFolder.findFirst({
    where: {
      id: folderId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const allFolders = await db.documentFolder.findMany({
    where: { organizationId: organization.id, deletedAt: null },
    select: { id: true, name: true, parentFolderId: true },
  });
  const ids = collectDescendantIds(folder.id, allFolders);
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const fRes = await tx.documentFolder.updateMany({
      where: {
        id: { in: ids },
        organizationId: organization.id,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    const dRes = await tx.document.updateMany({
      where: {
        folderId: { in: ids },
        organizationId: organization.id,
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    return { folders: fRes.count, documents: dRes.count };
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DocumentFolder",
    entityId: folder.id,
    before: { name: folder.name },
    after: { cascadeFolders: result.folders, cascadeDocuments: result.documents },
  });

  revalidatePath("/documents");
  return { ok: true, deletedCount: result.folders + result.documents };
}
