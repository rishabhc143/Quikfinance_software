import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseFileTypeParam, fileTypeFromMime } from "@/lib/documents/file-type";
import { getFolderPath, type FolderRow } from "@/lib/documents/folder-tree";
import { DocumentsShell } from "./documents-shell";
import type { DocumentTableRow } from "./documents-table";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/**
 * DOC-D1 / D1.2: Documents page server component.
 *
 * Renders the 3-pane shell (sidebar + toolbar + breadcrumb + filter +
 * table). URL params drive the filter:
 *   - ?view=trash            → soft-deleted rows
 *   - ?inbox=files           → Files inbox
 *   - ?inbox=bank-statements → Bank Statements inbox (D2 placeholder)
 *   - ?folderId=<id>         → drill into a folder
 *   - ?fileType=<bucket>     → narrow to one MIME bucket
 *
 * Default (no params) = "All Documents" excluding Trash.
 *
 * Wraps the DB work in try/catch so the page never 500s in the
 * narrow window between deploy + migration on prod.
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
  let folders: FolderRow[] = [];
  let folderBreadcrumb: Array<{ id: string; name: string }> = [];

  try {
    // Fetch all live folders for the org so the sidebar tree can
    // render in one pass. Cheap — typically dozens of rows, not
    // hundreds, and the index covers it.
    const folderRows = await db.documentFolder.findMany({
      where: { organizationId: organization.id, deletedAt: null },
      select: { id: true, name: true, parentFolderId: true },
      orderBy: { name: "asc" },
    });
    folders = folderRows;

    // Breadcrumb when drilled into a folder.
    folderBreadcrumb = params.folderId
      ? getFolderPath(params.folderId, folders)
      : [];

    // Fetch documents matching the view (Trash vs Live).
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

    // Build a folder-name lookup so the FOLDER column shows the real
    // folder name (not just the id) for D1.2-uploaded documents.
    const folderById = new Map(folders.map((f) => [f.id, f.name]));

    // Apply file-type filter at this layer (post-DB, since MIME is
    // grouped by helper, not stored as a bucket).
    const filteredDocs = fileTypeFilter
      ? docs.filter((d) => fileTypeFromMime(d.mimeType) === fileTypeFilter)
      : docs;

    rows = filteredDocs.map((d) => {
      const uploader = d.uploadedBy ? uploaderById.get(d.uploadedBy) : null;
      // Prefer the structured `folderId` → resolved name; fall back to
      // the legacy `folder` string (pre-D1.2 uploads).
      const folderName = d.folderId
        ? folderById.get(d.folderId) ?? null
        : d.folder ?? null;
      return {
        id: d.id,
        name: d.name,
        url: d.url,
        mimeType: d.mimeType,
        uploadedBy: uploader?.name || uploader?.email || "System",
        uploadedAt: d.createdAt.toISOString(),
        associatedTo:
          d.associatedEntityType && d.associatedEntityId
            ? `${d.associatedEntityType}`
            : null,
        folder: folderName,
      };
    });

    // Sidebar count for the Trash row.
    trashCount = await db.document.count({
      where: {
        organizationId: organization.id,
        deletedAt: { not: null },
      },
    });
  } catch (err) {
    console.error("[documents] data fetch failed", err);
    // Fall through with empty arrays; UI shows empty state.
  }

  return (
    <DocumentsShell
      rows={rows}
      trashCount={trashCount}
      folders={folders}
      folderBreadcrumb={folderBreadcrumb}
    />
  );
}
