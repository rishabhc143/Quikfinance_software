/**
 * DOC-D1.2: Folder tree builder + path resolver.
 *
 * Pure functions that operate on a flat array of folder rows (as
 * returned from Prisma) — no DB / Prisma dependency. Re-used by the
 * sidebar recursive renderer and the breadcrumb in the main pane.
 *
 * The folder model is recursive via `parentFolderId` (mirrors
 * ChartOfAccount.parentId). Roots have `parentFolderId === null`.
 */

export type FolderRow = {
  id: string;
  name: string;
  parentFolderId: string | null;
};

export type FolderTreeNode = FolderRow & {
  children: FolderTreeNode[];
  depth: number;
};

/**
 * Build a nested tree from a flat array. Returns root-level nodes
 * (parentFolderId === null) with children attached recursively.
 *
 * Sorts each level alphabetically by `name` (case-insensitive). Stable
 * with respect to input order when names tie.
 *
 * Orphan rows (parentFolderId points at a row not in the input set —
 * could happen mid-soft-delete) are surfaced as roots, so they're not
 * silently lost.
 */
export function buildFolderTree(rows: FolderRow[]): FolderTreeNode[] {
  const byParent = new Map<string | null, FolderRow[]>();
  const ids = new Set(rows.map((r) => r.id));

  for (const row of rows) {
    // Treat a non-null parentFolderId that doesn't exist in the set
    // as if it were null (orphan → surfaced as root).
    const key =
      row.parentFolderId && ids.has(row.parentFolderId)
        ? row.parentFolderId
        : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(row);
    else byParent.set(key, [row]);
  }

  function attach(parentId: string | null, depth: number): FolderTreeNode[] {
    const direct = byParent.get(parentId) ?? [];
    return direct
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map((row) => ({
        ...row,
        depth,
        children: attach(row.id, depth + 1),
      }));
  }

  return attach(null, 0);
}

/**
 * Resolve the breadcrumb path for a folder, walking from root → leaf.
 * Returns an array of `{ id, name }` from outermost to the target
 * folder. Returns empty when folderId is missing or not found.
 *
 * Cycle-safe: bails after `maxDepth` hops so a malformed parent
 * pointer (cycle from data corruption) can't hang the page.
 */
export function getFolderPath(
  folderId: string | null | undefined,
  rows: FolderRow[]
): Array<{ id: string; name: string }> {
  if (!folderId) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  const maxDepth = 64;

  let cursor: string | null | undefined = folderId;
  let hops = 0;
  while (cursor && hops < maxDepth) {
    if (seen.has(cursor)) break; // cycle guard
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) break;
    path.unshift({ id: row.id, name: row.name });
    cursor = row.parentFolderId;
    hops += 1;
  }
  return path;
}

/**
 * Flatten a tree back to a list of `{ id, name, depth }` entries in
 * display order (depth-first, pre-order). Useful for rendering the
 * tree as a flat list with indent levels (cheap virtualisation).
 */
export function flattenFolderTree(
  tree: FolderTreeNode[]
): Array<{ id: string; name: string; depth: number; hasChildren: boolean }> {
  const out: Array<{ id: string; name: string; depth: number; hasChildren: boolean }> = [];
  function walk(nodes: FolderTreeNode[]) {
    for (const n of nodes) {
      out.push({
        id: n.id,
        name: n.name,
        depth: n.depth,
        hasChildren: n.children.length > 0,
      });
      if (n.children.length) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

/**
 * Collect all descendant folder IDs (including the folder itself).
 * Useful for cascade soft-delete: when deleting a parent we mark every
 * descendant as deleted in one transaction.
 */
export function collectDescendantIds(
  folderId: string,
  rows: FolderRow[]
): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const row of rows) {
    const key = row.parentFolderId;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(row.id);
    else byParent.set(key, [row.id]);
  }

  const result: string[] = [folderId];
  const queue: string[] = [folderId];
  const seen = new Set<string>([folderId]);

  while (queue.length) {
    const current = queue.shift()!;
    const kids = byParent.get(current) ?? [];
    for (const kid of kids) {
      if (seen.has(kid)) continue;
      seen.add(kid);
      result.push(kid);
      queue.push(kid);
    }
  }
  return result;
}
