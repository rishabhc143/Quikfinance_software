"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Loader2, Tag, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import {
  listCandidatesAction,
  matchTransactionAction,
  categoriseAction,
  bulkCategoriseAction,
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

export type GLAccountOption = {
  id: string;
  name: string;
  code: string | null;
  type: "EXPENSE" | "COST_OF_GOODS_SOLD" | "INCOME" | "OTHER_INCOME";
};

const RECORD_TYPE_LABEL: Record<CandidateRecordType, string> = {
  INVOICE: "Invoice",
  BILL: "Bill",
  PAYMENT_RECEIVED: "Payment Received",
  PAYMENT_MADE: "Payment Made",
  EXPENSE: "Expense",
};

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent match";
  if (score >= 60) return "Good match";
  if (score >= 40) return "Fair match";
  return "Possible match";
}

function glOptionsFor(
  direction: "CREDIT" | "DEBIT",
  glAccounts: GLAccountOption[]
): ComboboxOption[] {
  const wanted =
    direction === "CREDIT"
      ? new Set(["INCOME", "OTHER_INCOME"])
      : new Set(["EXPENSE", "COST_OF_GOODS_SOLD"]);
  return glAccounts
    .filter((a) => wanted.has(a.type))
    .map((a) => ({
      value: a.id,
      label: a.code ? `${a.code} · ${a.name}` : a.name,
      hint: a.type.replace("_", " ").toLowerCase(),
    }));
}

export function MatchPane({
  bankAccountId,
  currency,
  unmatched,
  initialTxnId,
  glAccounts,
}: {
  bankAccountId: string;
  currency: string;
  unmatched: UnmatchedLine[];
  initialTxnId: string | null;
  glAccounts: GLAccountOption[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialTxnId);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matching, startMatching] = useTransition();

  // BNK-D: right-pane mode + the single-Categorise form state.
  const [mode, setMode] = useState<"candidates" | "categorise">("candidates");
  const [catGL, setCatGL] = useState<string | null>(null);
  const [catNotes, setCatNotes] = useState("");

  // BNK-D: left-pane multi-select state + the bulk-Categorise modal.
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkGL, setBulkGL] = useState<string | null>(null);
  const [bulkNotes, setBulkNotes] = useState("");

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
    setMode("candidates");
    setCatGL(null);
    setCatNotes("");
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
    const url = new URL(window.location.href);
    url.searchParams.set("txn", id);
    window.history.replaceState({}, "", url.toString());
  }

  function toggleChecked(id: string) {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearChecks() {
    setSelectedSet(new Set());
  }

  function advanceAfter(removedId: string) {
    const remaining = unmatched.filter((u) => u.id !== removedId);
    const next = remaining[0]?.id ?? null;
    setSelectedId(next);
    if (next) {
      const url = new URL(window.location.href);
      url.searchParams.set("txn", next);
      window.history.replaceState({}, "", url.toString());
    }
    setSelectedSet((prev) => {
      if (!prev.has(removedId)) return prev;
      const next = new Set(prev);
      next.delete(removedId);
      return next;
    });
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
      const id = selectedId;
      router.refresh();
      advanceAfter(id);
    });
  }

  function handleCategorise() {
    if (!selectedId || !catGL) return;
    startMatching(async () => {
      const res = await categoriseAction({
        bankTransactionId: selectedId,
        glAccountId: catGL,
        notes: catNotes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Categorise failed");
        return;
      }
      const id = selectedId;
      router.refresh();
      advanceAfter(id);
    });
  }

  function handleBulkCategorise() {
    if (selectedSet.size === 0 || !bulkGL) return;
    startMatching(async () => {
      const res = await bulkCategoriseAction({
        bankTransactionIds: Array.from(selectedSet),
        glAccountId: bulkGL,
        notes: bulkNotes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Bulk Categorise failed");
        return;
      }
      router.refresh();
      setBulkOpen(false);
      setBulkGL(null);
      setBulkNotes("");
      clearChecks();
    });
  }

  // Compute the direction shared across all currently-selected lines, or
  // null if they're mixed (which disables bulk Categorise).
  const bulkDirection: "CREDIT" | "DEBIT" | "MIXED" | null = useMemo(() => {
    if (selectedSet.size === 0) return null;
    const types = new Set(
      unmatched.filter((u) => selectedSet.has(u.id)).map((u) => u.type)
    );
    if (types.size === 0) return null;
    if (types.size > 1) return "MIXED";
    return types.values().next().value as "CREDIT" | "DEBIT";
  }, [selectedSet, unmatched]);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ─────────── Left pane: unmatched bank lines ─────────── */}
      <Card>
        <CardContent className="p-0">
          {/* Sticky bulk-action bar — appears when any row is checked. */}
          {selectedSet.size > 0 ? (
            <div className="px-4 py-2 border-b bg-muted/60 flex items-center justify-between gap-2 sticky top-0 z-10">
              <div className="text-sm">
                <span className="font-medium">{selectedSet.size} selected</span>
                {bulkDirection === "MIXED" ? (
                  <span className="text-destructive ml-2 text-xs">
                    Mixed directions — pick one type
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={bulkDirection === "MIXED" || matching}
                  onClick={() => setBulkOpen(true)}
                  className="gap-1"
                >
                  <Tag className="h-3.5 w-3.5" /> Categorise selected
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearChecks}
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 border-b text-sm font-medium flex items-center justify-between">
              <span>Unmatched ({unmatched.length})</span>
            </div>
          )}
          {unmatched.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              All transactions are matched or excluded.
            </div>
          ) : (
            <ul className="divide-y max-h-[70vh] overflow-y-auto">
              {unmatched.map((u) => {
                const isSel = u.id === selectedId;
                const isChecked = selectedSet.has(u.id);
                return (
                  <li key={u.id} className="relative">
                    <div
                      className={
                        "px-4 py-3 hover:bg-muted/60 transition-colors flex gap-3 " +
                        (isSel ? "bg-muted" : "")
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 cursor-pointer"
                        checked={isChecked}
                        onChange={() => toggleChecked(u.id)}
                        aria-label={`Select ${u.description ?? u.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleSelect(u.id)}
                        className="flex-1 text-left min-w-0"
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─────────── Right pane: candidates OR categorise ─────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            {selected ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {mode === "candidates" ? "Candidates for" : "Categorise"}
                  </div>
                  {mode === "categorise" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => setMode("candidates")}
                    >
                      ← Back to candidates
                    </Button>
                  ) : null}
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

          {!selected ? null : mode === "categorise" ? (
            <CategoriseForm
              direction={selected.type}
              glAccounts={glAccounts}
              gl={catGL}
              notes={catNotes}
              onChangeGL={setCatGL}
              onChangeNotes={setCatNotes}
              onSubmit={handleCategorise}
              busy={matching}
              error={error}
            />
          ) : loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Scoring candidates…
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : candidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
              <div>No candidates found in this org within ±30 days.</div>
              <Button size="sm" variant="outline" onClick={() => setMode("categorise")}>
                <Tag className="h-3.5 w-3.5 mr-1" /> Categorise to a GL account
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y max-h-[60vh] overflow-y-auto">
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
              <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span>Or none of these fits?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setMode("categorise")}
                >
                  <Tag className="h-3.5 w-3.5" /> Categorise instead
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Categorise modal — lightweight overlay; avoids adding a
          Dialog dependency just for one screen. */}
      {bulkOpen ? (
        <BulkCategoriseModal
          count={selectedSet.size}
          direction={bulkDirection === "MIXED" || bulkDirection === null ? "DEBIT" : bulkDirection}
          glAccounts={glAccounts}
          gl={bulkGL}
          notes={bulkNotes}
          busy={matching}
          error={error}
          onChangeGL={setBulkGL}
          onChangeNotes={setBulkNotes}
          onCancel={() => {
            setBulkOpen(false);
            setBulkGL(null);
            setBulkNotes("");
          }}
          onSubmit={handleBulkCategorise}
        />
      ) : null}

      <input type="hidden" value={bankAccountId} readOnly />
    </div>
  );
}

function CategoriseForm({
  direction,
  glAccounts,
  gl,
  notes,
  onChangeGL,
  onChangeNotes,
  onSubmit,
  busy,
  error,
}: {
  direction: "CREDIT" | "DEBIT";
  glAccounts: GLAccountOption[];
  gl: string | null;
  notes: string;
  onChangeGL: (v: string | null) => void;
  onChangeNotes: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const options = useMemo(
    () => glOptionsFor(direction, glAccounts),
    [direction, glAccounts]
  );
  const verb =
    direction === "DEBIT" ? "Categorise → creates Expense" : "Categorise → creates Journal Entry";

  return (
    <div className="p-4 space-y-4">
      <div>
        <Label className="text-xs">
          GL account *
          <span className="text-muted-foreground font-normal ml-1">
            ({direction === "DEBIT" ? "expense / COGS" : "income / other income"})
          </span>
        </Label>
        <Combobox
          options={options}
          value={gl}
          onChange={onChangeGL}
          placeholder="Pick a GL account…"
          empty={
            options.length === 0
              ? `No ${direction === "DEBIT" ? "expense" : "income"} accounts in this org. Add one under /accountant/chart-of-accounts.`
              : "No matches."
          }
        />
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Memo for the created record"
        />
      </div>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!gl || busy}
          className="gap-1"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Tag className="h-3.5 w-3.5" />
          )}
          {verb}
        </Button>
      </div>
    </div>
  );
}

function BulkCategoriseModal({
  count,
  direction,
  glAccounts,
  gl,
  notes,
  busy,
  error,
  onChangeGL,
  onChangeNotes,
  onCancel,
  onSubmit,
}: {
  count: number;
  direction: "CREDIT" | "DEBIT";
  glAccounts: GLAccountOption[];
  gl: string | null;
  notes: string;
  busy: boolean;
  error: string | null;
  onChangeGL: (v: string | null) => void;
  onChangeNotes: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const options = useMemo(
    () => glOptionsFor(direction, glAccounts),
    [direction, glAccounts]
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-5 space-y-4">
          <div>
            <div className="text-lg font-semibold">
              Categorise {count} {direction === "DEBIT" ? "Money Out" : "Money In"} {count === 1 ? "line" : "lines"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              All selected rows will be linked to the same GL account.
              {direction === "DEBIT"
                ? " One Expense row is created per line."
                : " One Journal Entry is created per line."}
            </p>
          </div>
          <div>
            <Label className="text-xs">GL account *</Label>
            <Combobox
              options={options}
              value={gl}
              onChange={onChangeGL}
              placeholder="Pick a GL account…"
              empty={
                options.length === 0
                  ? `No ${direction === "DEBIT" ? "expense" : "income"} accounts in this org.`
                  : "No matches."
              }
            />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => onChangeNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Memo applied to every created record"
            />
          </div>
          {error ? <div className="text-xs text-destructive">{error}</div> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={!gl || busy}
              className="gap-1"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tag className="h-3.5 w-3.5" />
              )}
              Categorise {count}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
