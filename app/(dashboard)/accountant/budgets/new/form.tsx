"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BudgetPeriod } from "@/lib/accounting/budgets";
import {
  createBudgetAndRedirectAction,
  type BudgetInput,
} from "../actions";

type Account = {
  id: string;
  name: string;
  code: string | null;
  type: string;
};

type Bucket = "INCOME" | "EXPENSE" | "ASSET" | "LIABILITY" | "EQUITY";

/**
 * ACCT-D.2 — Zoho-parity New Budget form.
 *
 *   Name *
 *   Fiscal Year * (3-option dropdown — prev FY / current / next)
 *   Budget Period * (Monthly / Quarterly / Yearly)
 *   ─ INCOME AND EXPENSE ACCOUNTS ─
 *   Income Accounts   [ + Add Accounts ]
 *   Expense Accounts  [ + Add Accounts ]
 *   ⊕ Include Asset, Liability, and Equity Accounts in Budget
 *     (when expanded, three more pickers appear)
 *
 *   [Create Budget]  [Cancel]
 *
 * The form deliberately does NOT capture per-account amounts.
 * The action creates the budget with zero amounts and redirects
 * to the detail page, where the user enters amounts directly into
 * an editable grid.
 */
export function BudgetForm({
  income,
  expense,
  asset,
  liability,
  equity,
  fiscalYearOptions,
  defaultFiscalYear,
}: {
  income: Account[];
  expense: Account[];
  asset: Account[];
  liability: Account[];
  equity: Account[];
  fiscalYearOptions: Array<{ value: number; label: string }>;
  defaultFiscalYear: number;
}) {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [fiscalYear, setFiscalYear] = React.useState<number>(defaultFiscalYear);
  const [budgetPeriod, setBudgetPeriod] =
    React.useState<BudgetPeriod>("MONTHLY");

  const [includeBalanceSheet, setIncludeBalanceSheet] = React.useState(false);
  const [picked, setPicked] = React.useState<Record<Bucket, Set<string>>>({
    INCOME: new Set(),
    EXPENSE: new Set(),
    ASSET: new Set(),
    LIABILITY: new Set(),
    EQUITY: new Set(),
  });
  const [busy, setBusy] = React.useState(false);

  function toggle(bucket: Bucket, id: string) {
    setPicked((prev) => {
      const next = new Set(prev[bucket]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [bucket]: next };
    });
  }

  function remove(bucket: Bucket, id: string) {
    setPicked((prev) => {
      const next = new Set(prev[bucket]);
      next.delete(id);
      return { ...prev, [bucket]: next };
    });
  }

  const allPickedIds = React.useMemo(() => {
    const all: string[] = [];
    for (const b of ["INCOME", "EXPENSE", "ASSET", "LIABILITY", "EQUITY"] as Bucket[]) {
      all.push(...Array.from(picked[b]));
    }
    return all;
  }, [picked]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name the budget");
      return;
    }
    if (allPickedIds.length === 0) {
      toast.error("Pick at least one account");
      return;
    }
    setBusy(true);
    try {
      const input: BudgetInput = {
        name: name.trim(),
        fiscalYear,
        budgetPeriod,
        accountIds: allPickedIds,
      };
      await createBudgetAndRedirectAction(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* ── Name (top band — coloured background per screenshot) ── */}
      <section className="bg-muted/30 -mx-6 px-6 py-5 grid gap-4 md:grid-cols-[10rem_1fr] items-center">
        <Label className="text-destructive">
          Name<span aria-hidden>*</span>
        </Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={160}
          autoFocus
          required
          className="max-w-md"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-[10rem_1fr] items-center">
        <Label className="text-destructive">
          Fiscal Year<span aria-hidden>*</span>
        </Label>
        <select
          value={fiscalYear}
          onChange={(e) => setFiscalYear(Number(e.target.value))}
          className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
          required
        >
          {fiscalYearOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <Label className="text-destructive">
          Budget Period<span aria-hidden>*</span>
        </Label>
        <select
          value={budgetPeriod}
          onChange={(e) =>
            setBudgetPeriod(e.target.value as BudgetPeriod)
          }
          className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
          required
        >
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </section>

      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground pt-2">
        Income and Expense Accounts
      </div>

      <AccountPickerRow
        label="Income Accounts"
        bucket="INCOME"
        options={income}
        picked={picked.INCOME}
        onToggle={(id) => toggle("INCOME", id)}
        onRemove={(id) => remove("INCOME", id)}
      />
      <AccountPickerRow
        label="Expense Accounts"
        bucket="EXPENSE"
        options={expense}
        picked={picked.EXPENSE}
        onToggle={(id) => toggle("EXPENSE", id)}
        onRemove={(id) => remove("EXPENSE", id)}
      />

      {!includeBalanceSheet ? (
        <button
          type="button"
          onClick={() => setIncludeBalanceSheet(true)}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary">
            <Plus className="h-3 w-3" />
          </span>
          Include Asset, Liability, and Equity Accounts in Budget
        </button>
      ) : (
        <>
          <AccountPickerRow
            label="Asset Accounts"
            bucket="ASSET"
            options={asset}
            picked={picked.ASSET}
            onToggle={(id) => toggle("ASSET", id)}
            onRemove={(id) => remove("ASSET", id)}
          />
          <AccountPickerRow
            label="Liability Accounts"
            bucket="LIABILITY"
            options={liability}
            picked={picked.LIABILITY}
            onToggle={(id) => toggle("LIABILITY", id)}
            onRemove={(id) => remove("LIABILITY", id)}
          />
          <AccountPickerRow
            label="Equity Accounts"
            bucket="EQUITY"
            options={equity}
            picked={picked.EQUITY}
            onToggle={(id) => toggle("EQUITY", id)}
            onRemove={(id) => remove("EQUITY", id)}
          />
        </>
      )}

      <div className="flex items-center gap-2 pt-6 border-t">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Budget
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/accountant/budgets")}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * One row inside the form: label on the left, an "Add Accounts"
 * popover on the right that toggles checkboxes against `options`.
 * Each picked account shows as a removable chip below the trigger.
 */
function AccountPickerRow({
  label,
  bucket,
  options,
  picked,
  onToggle,
  onRemove,
}: {
  label: string;
  bucket: Bucket;
  options: Account[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const pickedList = React.useMemo(
    () => options.filter((o) => picked.has(o.id)),
    [options, picked]
  );

  return (
    <div className="grid gap-2 md:grid-cols-[10rem_1fr] md:items-start">
      <Label className="md:pt-2 text-foreground">{label}</Label>
      <div className="space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="block w-full max-w-2xl rounded-md border border-dashed border-input bg-background py-2.5 text-left text-sm text-primary hover:bg-muted/40"
            >
              <span className="px-3">
                {picked.size === 0
                  ? "Add Accounts"
                  : `Add Accounts (${picked.size} selected)`}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[28rem] p-0"
            align="start"
            sideOffset={4}
          >
            {options.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No {label.toLowerCase()} exist yet — create one in Chart of
                Accounts first.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {options.map((o) => {
                  const checked = picked.has(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(o.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 truncate">
                        {o.code ? (
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {o.code}
                          </span>
                        ) : null}
                        {o.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {pickedList.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {pickedList.map((o) => (
              <span
                key={o.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs px-2 py-0.5"
              >
                {o.code ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {o.code}
                  </span>
                ) : null}
                {o.name}
                <button
                  type="button"
                  onClick={() => onRemove(o.id)}
                  className="hover:text-destructive"
                  aria-label={`Remove ${o.name} from ${bucket.toLowerCase()} accounts`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
