"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSavedViewAction } from "@/app/(dashboard)/sales/_saved-views/actions";

/**
 * M31: "+ New Custom View" dialog.
 *
 * Per Invoices Refinement Patch <saved_views_spec>: lets the user
 * save the current list filters as a named view scoped to their
 * userId. v1 captures status (multi-select) — date range / customer
 * multi-select / amount range come in a follow-up.
 *
 * The simplest UX possible: the user has already filtered the list
 * via the existing chevron-dropdown / status pickers; this dialog
 * just prompts for a name and persists the current filter as JSON.
 */

export function SavedViewBuilderDialog({
  module,
  trigger,
  /** All possible status values for this module — the user multi-selects
   *  which to include. */
  statusOptions,
}: {
  module: string;
  trigger: React.ReactNode;
  statusOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  function toggleStatus(v: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function onSave() {
    if (!name.trim()) {
      toast.error("Give your view a name");
      return;
    }
    if (selected.size === 0) {
      toast.error("Pick at least one status");
      return;
    }
    setBusy(true);
    try {
      const values = Array.from(selected);
      const filterJson =
        values.length === 1
          ? { kind: "status", value: values[0] }
          : { kind: "status", value: values };
      const r = await createSavedViewAction({
        module,
        name: name.trim(),
        filterJson,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Save failed");
        return;
      }
      toast.success(`Saved view "${name.trim()}"`);
      setName("");
      setSelected(new Set());
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom view</DialogTitle>
          <DialogDescription>
            Save a status filter as a named view. It will appear in
            the Saved Views dropdown for you only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sv-name">View name *</Label>
            <Input
              id="sv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Drafts"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Statuses to include *</Label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((s) => {
                const isOn = selected.has(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    aria-pressed={isOn}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (isOn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Date range / customer / amount filters land in a future
              update.
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onSave} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
