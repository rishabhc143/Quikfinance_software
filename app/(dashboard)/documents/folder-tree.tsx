"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  MoreVertical,
  Edit2,
  Trash2,
  FolderPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  buildFolderTree,
  type FolderRow,
  type FolderTreeNode,
} from "@/lib/documents/folder-tree";
import { softDeleteFolderAction } from "./actions";
import { CreateFolderDialog } from "./create-folder-dialog";
import { RenameFolderDialog } from "./rename-folder-dialog";

/**
 * DOC-D1.2: Recursive folder tree inside the Documents sidebar.
 *
 * Renders each folder as a row with chevron toggle + folder icon +
 * name. Right-side ⋯ menu offers Rename / New subfolder / Delete.
 *
 * Expansion state is tracked per-folder in local state; auto-expands
 * the ancestor chain of the currently-active folder (?folderId=) so
 * the user can see where they are.
 */
export function FolderTree({ folders }: { folders: FolderRow[] }) {
  const tree = React.useMemo(() => buildFolderTree(folders), [folders]);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeFolderId = searchParams.get("folderId");

  // Compute ancestor set so we can auto-expand to the active folder.
  const ancestorIds = React.useMemo(() => {
    if (!activeFolderId) return new Set<string>();
    const byId = new Map(folders.map((f) => [f.id, f]));
    const ids = new Set<string>();
    let cursor: string | null | undefined = activeFolderId;
    let hops = 0;
    while (cursor && hops < 64) {
      ids.add(cursor);
      const row = byId.get(cursor);
      if (!row) break;
      cursor = row.parentFolderId;
      hops += 1;
    }
    return ids;
  }, [activeFolderId, folders]);

  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(ancestorIds)
  );

  // When ancestorIds change (URL navigated to a deeper folder), merge
  // them into the expanded set without collapsing what the user already opened.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestorIds) next.add(id);
      return next;
    });
  }, [ancestorIds]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (tree.length === 0) return null;

  return (
    <div className="mt-2">
      {tree.map((node) => (
        <FolderNode
          key={node.id}
          node={node}
          expanded={expanded}
          toggle={toggle}
          activeFolderId={activeFolderId}
          pathname={pathname}
        />
      ))}
    </div>
  );
}

function FolderNode({
  node,
  expanded,
  toggle,
  activeFolderId,
  pathname,
}: {
  node: FolderTreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  activeFolderId: string | null;
  pathname: string;
}) {
  const router = useRouter();
  const isOpen = expanded.has(node.id);
  const isActive = activeFolderId === node.id;
  const hasChildren = node.children.length > 0;
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [newSubOpen, setNewSubOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function onDelete() {
    if (
      !confirm(
        node.children.length
          ? `Delete "${node.name}" and ${node.children.length} subfolder${
              node.children.length === 1 ? "" : "s"
            }? They'll move to Trash.`
          : `Delete "${node.name}"? It'll move to Trash.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await softDeleteFolderAction(node.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder moved to Trash");
    router.refresh();
  }

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1.5 text-sm transition-colors border-l-2",
          isActive
            ? "bg-primary/10 text-primary font-medium border-primary"
            : "text-foreground hover:bg-muted/60 border-transparent"
        )}
        style={{ paddingLeft: `${0.5 + node.depth * 0.75}rem` }}
      >
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={cn(
            "h-4 w-4 flex items-center justify-center shrink-0",
            !hasChildren && "invisible"
          )}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isOpen && "rotate-90"
            )}
          />
        </button>
        <Link
          href={`${pathname}?folderId=${node.id}`}
          className="flex-1 inline-flex items-center gap-1.5 min-w-0"
        >
          {isOpen && hasChildren ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-background"
            aria-label={`More actions for ${node.name}`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onSelect={() => setNewSubOpen(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-2" />
              New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Edit2 className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              disabled={deleting}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isOpen && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              expanded={expanded}
              toggle={toggle}
              activeFolderId={activeFolderId}
              pathname={pathname}
            />
          ))}
        </div>
      ) : null}

      <RenameFolderDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        folderId={node.id}
        currentName={node.name}
      />
      <CreateFolderDialog
        open={newSubOpen}
        onOpenChange={setNewSubOpen}
        parentFolderId={node.id}
        parentName={node.name}
      />
    </div>
  );
}
