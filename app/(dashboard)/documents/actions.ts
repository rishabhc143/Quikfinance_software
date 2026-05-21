"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { collectDescendantIds } from "@/lib/documents/folder-tree";

const schema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  mimeType: z.string().max(80).optional().nullable(),
  folder: z.string().max(80).optional().nullable(),
});

export async function createDocumentAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    name: formData.get("name"),
    url: formData.get("url"),
    mimeType: formData.get("mimeType") || null,
    folder: formData.get("folder") || null,
  });
  const created = await db.document.create({
    data: { organizationId: organization.id, ...data, uploadedBy: user.id },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Document", entityId: created.id, after: { name: data.name } });
  revalidatePath("/documents");
  redirect("/documents");
}

export async function deleteDocumentAction(id: string) {
  const { user, organization } = await requireOrganization();
  const d = await db.document.findFirst({ where: { id, organizationId: organization.id } });
  if (!d) return { ok: false };
  await db.document.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Document", entityId: id, before: { name: d.name } });
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Direct-upload action — uploads a file from the browser to Vercel
 * Blob storage, then persists the resulting URL as a Document row.
 *
 * Fail-open: if `BLOB_READ_WRITE_TOKEN` is not configured (e.g. local
 * dev without Vercel Blob), returns an error string instead of
 * throwing. The UI surfaces this to the user.
 *
 * Size cap enforced server-side at 10 MB. Most receipt/contract PDFs
 * are well under this; larger media should use external hosting +
 * paste the URL.
 */
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export async function uploadDocumentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error:
        "Direct file upload is not configured on this deployment. Ask your admin to add BLOB_READ_WRITE_TOKEN to the environment.",
    };
  }

  const { user, organization } = await requireOrganization();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file before uploading." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
    };
  }
  if (file.type && !ALLOWED_MIMES.includes(file.type)) {
    return {
      ok: false,
      error: `File type "${file.type}" is not allowed. Supported: PDF, JPG, PNG, WEBP, HEIC, CSV, XLS, XLSX.`,
    };
  }

  const folderRaw = (formData.get("folder") as string | null) ?? "";
  const folder = folderRaw.trim().slice(0, 80) || null;
  const displayName =
    ((formData.get("name") as string | null) ?? "").trim().slice(0, 200) ||
    file.name;

  // Namespace by org so blobs are easy to audit and clean up.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blobKey = `org-${organization.id}/${Date.now()}-${safeName}`;

  let blobUrl: string;
  try {
    const blob = await put(blobKey, file, {
      access: "public",
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
  } catch (err) {
    console.error("[documents/upload] Vercel Blob put failed", err);
    return {
      ok: false,
      error: "Upload failed. Check your connection and try again.",
    };
  }

  const created = await db.document.create({
    data: {
      organizationId: organization.id,
      name: displayName,
      url: blobUrl,
      mimeType: file.type || null,
      folder,
      uploadedBy: user.id,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Document",
    entityId: created.id,
    after: { name: displayName, source: "blob-upload" },
  });
  revalidatePath("/documents");
  return { ok: true };
}

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
