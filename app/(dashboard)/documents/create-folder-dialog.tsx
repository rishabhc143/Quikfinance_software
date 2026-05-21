"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createFolderAction } from "./actions";

/**
 * DOC-D1.2: "Create New Folder" modal triggered from the FOLDERS
 * section's "+" button OR from a folder's ⋯ → New subfolder.
 *
 * Controlled — caller passes `open` / `onOpenChange`. When
 * `parentFolderId` is set, the modal creates a subfolder under that
 * folder (the parent name is surfaced in the description so users
 * can confirm where it'll land).
 */
export function CreateFolderDialog({
  open,
  onOpenChange,
  parentFolderId,
  parentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentFolderId?: string | null;
  parentName?: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset state on close so re-opening is clean.
  React.useEffect(() => {
    if (!open) {
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Folder name is required");
      return;
    }
    setSubmitting(true);
    const result = await createFolderAction({
      name: trimmed,
      parentFolderId: parentFolderId ?? null,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder created");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            New Folder
          </DialogTitle>
          <DialogDescription>
            {parentFolderId && parentName
              ? `Create a subfolder inside "${parentName}".`
              : "Create a new top-level folder."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="folder-name">
              Folder name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              placeholder="Receipts, Contracts, 2026 Q1…"
              maxLength={120}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Creating…
                </>
              ) : (
                "Create Folder"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
