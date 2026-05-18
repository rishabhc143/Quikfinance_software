"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

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
