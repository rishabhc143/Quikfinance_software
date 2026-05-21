import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseFileTypeParam, fileTypeFromMime } from "@/lib/documents/file-type";
import { DocumentsShell } from "./documents-shell";
import type { DocumentTableRow } from "./documents-table";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/**
 * DOC-D1: Documents page server component.
 *
 * Renders the 3-pane shell (sidebar + toolbar + filter + table). URL
 * params drive the filter:
 *   - ?view=trash         → show only soft-deleted rows
 *   - ?inbox=files        → Files inbox
 *   - ?inbox=bank-statements → Bank Statements inbox (placeholder
 *     until Phase D2 Smart Capture populates it)
 *   - ?folderId=<id>      → drill into a folder (D1.2)
 *   - ?fileType=<bucket>  → narrow to one MIME bucket
 *
 * Default (no params) = "All Documents" excluding Trash.
 *
 * Wraps the DB work in try/catch so the page never 500s in the
 * narrow window between deploy + migration on prod (same pattern
 * used by `/getting-started`).
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: {
    view?: string;
    inbox?: string;
    folderId?: string;
    fileType?: string;
  };
}) {
  const { organization } = await requireOrganization();
  const params = searchParams ?? {};
  const showTrash = params.view === "trash";
  const fileTypeFilter = parseFileTypeParam(params.fileType);

  let rows: DocumentTableRow[] = [];
  let trashCount = 0;
  let folderCount = 0;

  try {
    // Fetch all documents matching the view (Trash vs Live).
    const docs = await db.document.findMany({
      where: {
        organizationId: organization.id,
        deletedAt: showTrash ? { not: null } : null,
        ...(params.inbox === "files" ? { inbox: "FILES" } : {}),
        ...(params.inbox === "bank-statements"
          ? { inbox: "BANK_STATEMENTS" }
          : {}),
        ...(params.folderId ? { folderId: params.folderId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Look up uploader display names in one batch (small set; org-scoped).
    const uploaderIds = Array.from(
      new Set(docs.map((d) => d.uploadedBy).filter((x): x is string => !!x))
    );
    const uploaders = uploaderIds.length
      ? await db.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const uploaderById = new Map(uploaders.map((u) => [u.id, u]));

    // Apply file-type filter at this layer (post-DB, since MIME is
    // grouped by helper, not stored as a bucket).
    const filteredDocs = fileTypeFilter
      ? docs.filter((d) => fileTypeFromMime(d.mimeType) === fileTypeFilter)
      : docs;

    rows = filteredDocs.map((d) => {
      const uploader = d.uploadedBy ? uploaderById.get(d.uploadedBy) : null;
      return {
        id: d.id,
        name: d.name,
        url: d.url,
        mimeType: d.mimeType,
        uploadedBy: uploader?.name || uploader?.email || "System",
        uploadedAt: d.createdAt.toISOString(),
        // Associated To column is wired in PR D1.4 — for now just
        // render the polymorphic columns as-is, or "—" when unset.
        associatedTo:
          d.associatedEntityType && d.associatedEntityId
            ? `${d.associatedEntityType}`
            : null,
        folder: d.folder ?? null,
      };
    });

    // Sidebar counts.
    [trashCount, folderCount] = await Promise.all([
      db.document.count({
        where: {
          organizationId: organization.id,
          deletedAt: { not: null },
        },
      }),
      db.documentFolder.count({
        where: {
          organizationId: organization.id,
          deletedAt: null,
        },
      }),
    ]);
  } catch (err) {
    console.error("[documents] data fetch failed", err);
    // Fall through with empty arrays; UI shows empty state.
  }

  return (
    <DocumentsShell
      rows={rows}
      trashCount={trashCount}
      folderCount={folderCount}
    />
  );
}
