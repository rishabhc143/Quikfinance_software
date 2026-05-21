import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseFileTypeParam, fileTypeFromMime } from "@/lib/documents/file-type";
import { getFolderPath, type FolderRow } from "@/lib/documents/folder-tree";
import {
  asAssociatedEntityType,
  buildAssociatedToCell,
  type AssociatedEntityType,
} from "@/lib/documents/associated-to";
import { DocumentsShell } from "./documents-shell";
import type { DocumentTableRow } from "./documents-table";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/**
 * DOC-D1 / D1.2 / D1.4: Documents page server component.
 *
 * Renders the 3-pane shell (sidebar + toolbar + breadcrumb + filter +
 * table). URL params drive the filter:
 *   - ?view=trash            → soft-deleted rows (Restore + Purge actions)
 *   - ?inbox=files           → Files inbox (drag-drop surface)
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

    // DOC-D1.4: Batch-resolve associated entities so the ASSOCIATED
    // TO column can show the real name (not just the type). Groups
    // IDs by type, runs one Prisma query per type, builds a Map for
    // O(1) lookups when assembling rows below.
    const idsByType = new Map<AssociatedEntityType, Set<string>>();
    for (const d of docs) {
      const t = asAssociatedEntityType(d.associatedEntityType);
      if (!t || !d.associatedEntityId) continue;
      const set = idsByType.get(t);
      if (set) set.add(d.associatedEntityId);
      else idsByType.set(t, new Set([d.associatedEntityId]));
    }

    const nameMap = await resolveAssociatedNames(
      organization.id,
      idsByType
    );

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

      const aType = asAssociatedEntityType(d.associatedEntityType);
      const aCell =
        aType && d.associatedEntityId
          ? buildAssociatedToCell(
              aType,
              d.associatedEntityId,
              nameMap.get(`${aType}:${d.associatedEntityId}`)
            )
          : null;

      return {
        id: d.id,
        name: d.name,
        url: d.url,
        mimeType: d.mimeType,
        uploadedBy: uploader?.name || uploader?.email || "System",
        uploadedAt: d.createdAt.toISOString(),
        associatedTo: aCell,
        folder: folderName,
        // DOC-D2.1: Smart Capture fields forwarded to the preview
        // drawer. Null on legacy / non-PDF / extraction-failed rows.
        documentType: d.documentType,
        extractedText: d.extractedText,
        // DOC-D2.2: Parsed bank statement (JSONB). Non-null only for
        // BANK_STATEMENT docs whose layout matched HDFC/ICICI parser
        // heuristics. UI renders Transactions table + Import button
        // when present.
        extractedFields: d.extractedFields,
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
      trashView={showTrash}
    />
  );
}

/**
 * DOC-D1.4: Resolve display names for associated entities, batched
 * per type. Returns a `Map<"Type:id", name>` for O(1) lookup.
 *
 * Each branch is a small org-scoped Prisma query selecting the
 * minimum fields needed (display name + id). Missing rows fall
 * through and the cell helper substitutes the id.
 *
 * Wrapped in try/catch per type so a missing/renamed table doesn't
 * 500 the page — the row just falls back to the bare id.
 */
async function resolveAssociatedNames(
  organizationId: string,
  idsByType: Map<AssociatedEntityType, Set<string>>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  for (const [type, idSet] of idsByType.entries()) {
    const ids = Array.from(idSet);
    if (ids.length === 0) continue;

    try {
      // All Sales/Purchases doc models use `number` (not modelNumber)
      // — checked against prisma/schema.prisma. UI labels them as
      // "Invoice#", "Bill#", "PO#", etc.
      switch (type) {
        case "Invoice": {
          const rows = await db.invoice.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`Invoice:${r.id}`, r.number);
          break;
        }
        case "Bill": {
          const rows = await db.bill.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`Bill:${r.id}`, r.number);
          break;
        }
        case "Contact": {
          const rows = await db.contact.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, displayName: true },
          });
          for (const r of rows) out.set(`Contact:${r.id}`, r.displayName);
          break;
        }
        case "Quote": {
          const rows = await db.quote.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`Quote:${r.id}`, r.number);
          break;
        }
        case "SalesOrder": {
          const rows = await db.salesOrder.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`SalesOrder:${r.id}`, r.number);
          break;
        }
        case "CreditNote": {
          const rows = await db.creditNote.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`CreditNote:${r.id}`, r.number);
          break;
        }
        case "PurchaseOrder": {
          const rows = await db.purchaseOrder.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, number: true },
          });
          for (const r of rows) out.set(`PurchaseOrder:${r.id}`, r.number);
          break;
        }
        case "Project": {
          const rows = await db.project.findMany({
            where: { id: { in: ids }, organizationId },
            select: { id: true, name: true },
          });
          for (const r of rows) out.set(`Project:${r.id}`, r.name);
          break;
        }
        default:
          // Other types (Expense, ManualJournal, BankTransaction,
          // PaymentMade, PaymentReceived, VendorCredit,
          // DeliveryChallan) are valid but the lookup falls back to
          // the id until those modules surface a canonical "display
          // number" — keeps this PR small.
          break;
      }
    } catch (err) {
      console.warn(
        `[documents] failed to resolve names for type=${type}`,
        err
      );
    }
  }

  return out;
}
