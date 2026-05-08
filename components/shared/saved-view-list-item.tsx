"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteSavedViewAction } from "@/app/(dashboard)/sales/_saved-views/actions";

/**
 * M34: One row in the chevron-dropdown's "Saved views" list.
 *
 * System views render as a plain link. User-created views (isSystem
 * === false && id present) render with a trailing X button that
 * deletes the view via deleteSavedViewAction.
 *
 * The X is kept inline (not a nested menu) so the user can delete
 * from the same panel they're choosing views in. The DropdownMenu's
 * Item handles "click anywhere on the row → navigate"; we stop
 * propagation on the X so clicking it doesn't follow the link.
 */
export function SavedViewListItem({
  id,
  value,
  label,
  isActive,
  isSystem,
}: {
  id?: string;
  value: string;
  label: string;
  isActive: boolean;
  isSystem: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const showDelete = !isSystem && !!id;

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!id) return;
    if (!confirm(`Delete the saved view "${label}"?`)) return;
    setBusy(true);
    try {
      const r = await deleteSavedViewAction({ id });
      if (!r.ok) {
        toast.error(r.error ?? "Delete failed");
        return;
      }
      toast.success(`Deleted view "${label}"`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenuItem
      asChild
      // The X button lives inside the menu item; without this, clicks
      // on the X also dismiss the menu before our handler runs.
      onSelect={(e) => {
        if (showDelete) e.preventDefault();
      }}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Link
          href={`?view=${encodeURIComponent(value)}`}
          className={"flex-1 " + (isActive ? "font-semibold" : "")}
        >
          {label}
        </Link>
        {showDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Delete saved view ${label}`}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>
    </DropdownMenuItem>
  );
}
