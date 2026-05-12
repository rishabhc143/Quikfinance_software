"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import {
  listCandidatesAction,
  matchTransactionAction,
  type CandidateView,
} from "./actions";
import type { CandidateRecordType } from "@/lib/banking/match-candidates";

export type UnmatchedLine = {
  id: string;
  /** ISO string — Server Component serialization friendly. */
  date: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  description: string | null;
  reference: string | null;
};

const RECORD_TYPE_LABEL: Record<CandidateRecordType, string> = {
  INVOICE: "Invoice",
  BILL: "Bill",
  PAYMENT_RECEIVED: "Payment Received",
  PAYMENT_MADE: "Payment Made",
  EXPENSE: "Expense",
};

/**
 * Score → human label. Cutoff is 30 so anything we display is at least
 * a "fair" match. Tuning hint: bump these thresholds once we have real
 * usage data.
 */
function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent match";
  if (score >= 60) return "Good match";
  if (score >= 40) return "Fair match";
  return "Possible match";
}

export function MatchPane({
  bankAccountId,
  currency,
  unmatched,
  initialTxnId,
}: {
  bankAccountId: string;
  currency: string;
  unmatched: UnmatchedLine[];
  initialTxnId: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialTxnId);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matching, startMatching] = useTransition();

  const selected = unmatched.find((u) => u.id === selectedId) ?? null;

  // Fetch candidates whenever the selected line changes.
  useEffect(() => {
    if (!selectedId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCandidatesAction({ bankTransactionId: selectedId })
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load candidates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    // Reflect selection in the URL so a page refresh / share keeps the
    // selected line. shallow=true semantics — no full server reload.
    const url = new URL(window.location.href);
    url.searchParams.set("txn", id);
    window.history.replaceState({}, "", url.toString());
  }

  function handleMatch(candidate: CandidateView) {
    if (!selectedId) return;
    startMatching(async () => {
      const res = await matchTransactionAction({
        bankTransactionId: selectedId,
        recordType: candidate.type,
        recordId: candidate.id,
      });
      if (!res.ok) {
        setError(res.error ?? "Match failed");
        return;
      }
      // Refresh the page so the matched line drops out of the queue
      // and the per-account view reflects the new state.
      router.refresh();
      // Advance selection to the next unmatched line, if any.
      const remaining = unmatched.filter((u) => u.id !== selectedId);
      const next = remaining[0]?.id ?? null;
      setSelectedId(next);
      if (next) {
        const url = new URL(window.location.href);
        url.searchParams.set("txn", next);
        window.history.replaceState({}, "", url.toString());
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ─────────── Left pane: unmatched bank lines ─────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b text-sm font-medium flex items-center justify-between">
            <span>Unmatched ({unmatched.length})</span>
          </div>
          {unmatched.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              All transactions are matched or excluded.
            </div>
          ) : (
            <ul className="divide-y max-h-[70vh] overflow-y-auto">
              {unmatched.map((u) => {
                const isSel = u.id === selectedId;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(u.id)}
                      className={
                        "w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors " +
                        (isSel ? "bg-muted" : "")
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(u.date), "dd MMM yyyy")}
                        </span>
                        <span className="tabular-nums text-sm font-medium">
                          {formatMoney(u.amount, currency)}
                        </span>
                      </div>
                      <div className="text-sm mt-1 line-clamp-1">
                        {u.description ?? "—"}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={u.type === "CREDIT" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {u.type === "CREDIT" ? "Money In" : "Money Out"}
                        </Badge>
                        {u.reference ? (
                          <span className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                            {u.reference}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─────────── Right pane: candidate list ─────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            {selected ? (
              <div>
                <div className="text-xs text-muted-foreground">
                  Candidates for
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <div className="text-sm font-medium line-clamp-1">
                    {selected.description ?? "—"}
                  </div>
                  <div className="tabular-nums text-sm font-medium">
                    {formatMoney(selected.amount, currency)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(selected.date), "dd MMM yyyy")} ·{" "}
                  {selected.type === "CREDIT" ? "Money In" : "Money Out"}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Pick a transaction to see candidates.
              </div>
            )}
          </div>

          {!selected ? null : loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Scoring candidates…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No candidates found in this org within ±30 days. Try the
              Categorise flow (BNK-D) to post a journal entry directly.
            </div>
          ) : (
            <ul className="divide-y max-h-[70vh] overflow-y-auto">
              {candidates.map((c) => (
                <li
                  key={`${c.type}:${c.id}`}
                  className="px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {RECORD_TYPE_LABEL[c.type]}
                      </Badge>
                      <span className="text-sm font-medium font-mono">
                        {c.number}
                      </span>
                      {c.status ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {c.status}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm mt-1 line-clamp-1">
                      {c.counterparty ?? "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {format(c.date, "dd MMM yyyy")} ·{" "}
                      <span className="tabular-nums">
                        {formatMoney(c.amount, currency)}
                      </span>{" "}
                      · {c.score} pts · {scoreLabel(c.score)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleMatch(c)}
                    disabled={matching}
                    className="gap-1"
                  >
                    {matching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Match
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* bankAccountId is used by the server actions for revalidation;
          keep it referenced so the linter doesn't trim it. */}
      <input type="hidden" value={bankAccountId} readOnly />
    </div>
  );
}
