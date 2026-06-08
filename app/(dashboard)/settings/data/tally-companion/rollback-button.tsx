"use client";

import { useState, useTransition } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { rollbackBatchAction } from "./actions";

/**
 * Sprint 4 — Inline Undo button per batch.
 *
 * Two-step confirmation: first click expands a confirm panel with
 * a warning + explicit Confirm/Cancel. Avoids accidental rollbacks
 * via fat-fingered clicks while still keeping the action one
 * gesture away from the history list.
 */
export function RollbackButton({ batchId }: { batchId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await rollbackBatchAction(batchId);
      if (!result.ok) setError(result.error);
      else {
        // page revalidates server-side; the batch row will re-render
        // with status='rolled_back' which hides this button.
        setExpanded(false);
        setError(null);
      }
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-input bg-background hover:bg-muted/50"
      >
        <Undo2 className="h-3 w-3" />
        Undo this import
      </button>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-2 text-xs">
      <div className="text-amber-900">
        This soft-deletes every ledger + voucher this import created. Your
        Tally file is unaffected. The action is reversible by re-importing
        the same XML.
      </div>
      {error && <div className="text-red-700">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          disabled={isPending}
          className="px-2 py-0.5 rounded hover:bg-amber-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Confirm undo
        </button>
      </div>
    </div>
  );
}
