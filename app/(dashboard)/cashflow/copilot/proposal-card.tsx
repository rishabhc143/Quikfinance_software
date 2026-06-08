"use client";

import { useState, useTransition } from "react";
import { Check, X, ShieldCheck, Loader2 } from "lucide-react";

/**
 * CFO Copilot Mutating Tools v1 — approval card.
 *
 * Renders a pending CopilotProposedAction as an inline card with
 * Approve/Reject buttons. On Approve, POSTs to the action endpoint
 * which runs the executor server-side. On Reject, posts the same
 * endpoint with decision=reject.
 *
 * The card disappears (status=approved or =rejected) after a
 * successful response.
 */

export type Proposal = {
  id: string;
  actionType: string;
  summary: string;
  payload: unknown;
  expiresAt: string;
  createdAt: string;
};

export function ProposalCard({
  proposal,
  onResolved,
}: {
  proposal: Proposal;
  onResolved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function submit(decision: "approve" | "reject") {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(
          `/api/cashflow/copilot/actions/${proposal.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
          }
        );
        const json = (await res.json()) as
          | { ok: true; status: string; executionError?: string | null }
          | { error: string };
        if (!res.ok || "error" in json) {
          setError("error" in json ? json.error : `HTTP ${res.status}`);
          return;
        }
        if (json.executionError) {
          setError(`Approved but execution failed: ${json.executionError}`);
          return;
        }
        onResolved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      }
    });
  }

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 my-2">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-amber-700 font-medium mb-1">
            Approval required — Copilot proposed action
          </div>
          <div className="text-sm font-medium text-amber-950">
            {proposal.summary}
          </div>
          {error && (
            <div className="text-xs text-red-700 mt-2 bg-red-50 border border-red-200 rounded px-2 py-1">
              {error}
            </div>
          )}
          {!confirming ? (
            <div className="flex gap-2 mt-2 justify-end">
              <button
                type="button"
                onClick={() => submit("reject")}
                disabled={isPending}
                className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Approve
              </button>
            </div>
          ) : (
            <div className="flex gap-2 mt-2 justify-end items-center">
              <span className="text-xs text-amber-900">Are you sure?</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="text-xs px-2 py-1 rounded hover:bg-amber-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit("approve")}
                disabled={isPending}
                className="text-xs inline-flex items-center gap-1 px-3 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Confirm approve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
