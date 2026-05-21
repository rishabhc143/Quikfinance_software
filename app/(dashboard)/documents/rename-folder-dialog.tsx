"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Edit2 } from "lucide-react";
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
import { renameFolderAction } from "./actions";

/**
 * DOC-D1.2: Rename modal for a single folder. Pre-fills with current
 * name so the user can edit in place. Renamed value is trim-empty
 * checked client-side; server-side validation matches.
 */
export function RenameFolderDialog({
  open,
  onOpenChange,
  folderId,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(currentName);
  const [submitting, setSubmitting] = React.useState(false);

  // Re-seed when the modal re-opens for a different folder.
  React.useEffect(() => {
    if (open) {
      setName(currentName);
      setSubmitting(false);
    }
  }, [open, currentName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Folder name is required");
      return;
    }
    if (trimmed === currentName) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    const result = await renameFolderAction({ folderId, name: trimmed });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder renamed");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5 text-primary" />
            Rename Folder
          </DialogTitle>
          <DialogDescription>
            Rename &ldquo;{currentName}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="folder-rename">
              Folder name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="folder-rename"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
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
            <Button
              type="submit"
              disabled={submitting || !name.trim() || name.trim() === currentName}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Renaming…
                </>
              ) : (
                "Rename"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
