"use client";

/**
 * CF-7 — Dismiss-button client component.
 *
 * On click expands into a small inline form with a "Why dismissing?"
 * input and Cancel / Confirm buttons. The reason is optional — if
 * the user just wants to clear an obviously-false alert, forcing a
 * mandatory reason creates friction. But we record it when given
 * so audit logs are useful when reviewing dismissed alerts in v2.
 */

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { dismissAnomalyAction } from "./actions";

export function DismissButton({ id }: { id: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit() {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("reason", reason);
    startTransition(async () => {
      const result = await dismissAnomalyAction({ ok: false }, fd);
      if (!result.ok) {
        setError(result.error ?? "Failed to dismiss");
      } else {
        // Page revalidates via the server action; component unmounts
        // when the alert disappears from the list.
        setError(null);
      }
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-background/50 transition"
        aria-label="Dismiss alert"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="text-xs px-2 py-1 rounded border border-input bg-background"
        autoFocus
        disabled={isPending}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setReason("");
            setError(null);
          }}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded hover:bg-background/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "..." : "Confirm"}
        </button>
      </div>
    </div>
  );
}
