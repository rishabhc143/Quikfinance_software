import { describe, it, expect } from "vitest";
import {
  buildFolderTree,
  getFolderPath,
  flattenFolderTree,
  collectDescendantIds,
  type FolderRow,
} from "@/lib/documents/folder-tree";

function row(id: string, name: string, parentFolderId: string | null = null): FolderRow {
  return { id, name, parentFolderId };
}

describe("documents/folder-tree", () => {
  describe("buildFolderTree", () => {
    it("returns empty array for empty input", () => {
      expect(buildFolderTree([])).toEqual([]);
    });

    it("returns root nodes when no children present", () => {
      const tree = buildFolderTree([
        row("a", "Alpha"),
        row("b", "Beta"),
      ]);
      expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
      expect(tree[0].children).toEqual([]);
      expect(tree[0].depth).toBe(0);
    });

    it("sorts each level alphabetically (case-insensitive)", () => {
      const tree = buildFolderTree([
        row("c", "charlie"),
        row("a", "alpha"),
        row("b", "Bravo"),
      ]);
      expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
    });

    it("attaches children to parents recursively", () => {
      const tree = buildFolderTree([
        row("root", "Root"),
        row("child1", "Child 1", "root"),
        row("child2", "Child 2", "root"),
        row("grand", "Grand", "child1"),
      ]);
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("root");
      expect(tree[0].depth).toBe(0);
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].depth).toBe(1);
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].id).toBe("grand");
      expect(tree[0].children[0].children[0].depth).toBe(2);
    });

    it("surfaces orphan rows (dangling parentFolderId) as roots", () => {
      const tree = buildFolderTree([
        row("orphan", "Orphan", "missing-parent-id"),
      ]);
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("orphan");
      expect(tree[0].depth).toBe(0);
    });

    it("handles multiple roots with mixed depths", () => {
      const tree = buildFolderTree([
        row("a", "A"),
        row("a1", "A1", "a"),
        row("b", "B"),
        row("b1", "B1", "b"),
        row("b2", "B2", "b"),
        row("b1a", "B1a", "b1"),
      ]);
      expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
      expect(tree[0].children.map((n) => n.id)).toEqual(["a1"]);
      expect(tree[1].children.map((n) => n.id)).toEqual(["b1", "b2"]);
      expect(tree[1].children[0].children.map((n) => n.id)).toEqual(["b1a"]);
    });
  });

  describe("getFolderPath", () => {
    const rows: FolderRow[] = [
      row("root", "Root"),
      row("child", "Child", "root"),
      row("grand", "Grand", "child"),
    ];

    it("returns empty when folderId is null/undefined/empty", () => {
      expect(getFolderPath(null, rows)).toEqual([]);
      expect(getFolderPath(undefined, rows)).toEqual([]);
      expect(getFolderPath("", rows)).toEqual([]);
    });

    it("returns empty when folder not found", () => {
      expect(getFolderPath("missing", rows)).toEqual([]);
    });

    it("walks ancestors from root → leaf for a deep node", () => {
      expect(getFolderPath("grand", rows)).toEqual([
        { id: "root", name: "Root" },
        { id: "child", name: "Child" },
        { id: "grand", name: "Grand" },
      ]);
    });

    it("returns a single entry for a root folder", () => {
      expect(getFolderPath("root", rows)).toEqual([
        { id: "root", name: "Root" },
      ]);
    });

    it("is cycle-safe (broken data with a parent pointing back to itself)", () => {
      const cyclic: FolderRow[] = [
        { id: "a", name: "A", parentFolderId: "b" },
        { id: "b", name: "B", parentFolderId: "a" },
      ];
      const result = getFolderPath("a", cyclic);
      // Should NOT hang. Result has at most 2 entries before the
      // cycle guard kicks in.
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe("flattenFolderTree", () => {
    it("returns empty when tree is empty", () => {
      expect(flattenFolderTree([])).toEqual([]);
    });

    it("flattens depth-first, pre-order with correct depth + hasChildren", () => {
      const tree = buildFolderTree([
        row("a", "A"),
        row("a1", "A1", "a"),
        row("a1a", "A1a", "a1"),
        row("a2", "A2", "a"),
        row("b", "B"),
      ]);
      const flat = flattenFolderTree(tree);
      expect(flat).toEqual([
        { id: "a", name: "A", depth: 0, hasChildren: true },
        { id: "a1", name: "A1", depth: 1, hasChildren: true },
        { id: "a1a", name: "A1a", depth: 2, hasChildren: false },
        { id: "a2", name: "A2", depth: 1, hasChildren: false },
        { id: "b", name: "B", depth: 0, hasChildren: false },
      ]);
    });
  });

  describe("collectDescendantIds", () => {
    const rows: FolderRow[] = [
      row("root", "Root"),
      row("c1", "C1", "root"),
      row("c2", "C2", "root"),
      row("gc1", "GC1", "c1"),
      row("gc2", "GC2", "c1"),
      row("other", "Other"),
    ];

    it("includes the folder itself", () => {
      const ids = collectDescendantIds("gc1", rows);
      expect(ids).toContain("gc1");
    });

    it("returns just the id when no children", () => {
      expect(collectDescendantIds("gc1", rows)).toEqual(["gc1"]);
      expect(collectDescendantIds("other", rows)).toEqual(["other"]);
    });

    it("collects all descendants (depth-first BFS order)", () => {
      const ids = collectDescendantIds("root", rows);
      expect(ids).toContain("root");
      expect(ids).toContain("c1");
      expect(ids).toContain("c2");
      expect(ids).toContain("gc1");
      expect(ids).toContain("gc2");
      expect(ids).not.toContain("other");
      expect(ids).toHaveLength(5);
    });
  });
});
