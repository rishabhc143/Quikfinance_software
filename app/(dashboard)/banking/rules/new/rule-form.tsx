"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { toast } from "sonner";
import type { RuleInput } from "../actions";

type BankAccountOption = { id: string; name: string };
type GLAccountOption = {
  id: string;
  name: string;
  code: string | null;
  type: "EXPENSE" | "COST_OF_GOODS_SOLD" | "INCOME" | "OTHER_INCOME";
};

type Condition = {
  field: "DESCRIPTION" | "REFERENCE" | "AMOUNT";
  op:
    | "CONTAINS"
    | "STARTS_WITH"
    | "EQUALS"
    | "IS_EMPTY"
    | "EQ"
    | "GT"
    | "LT"
    | "GTE"
    | "LTE";
  value: string;
};

const TEXT_OPS: Condition["op"][] = ["CONTAINS", "STARTS_WITH", "EQUALS", "IS_EMPTY"];
const NUMERIC_OPS: Condition["op"][] = ["EQ", "GT", "LT", "GTE", "LTE"];

const OP_LABEL: Record<Condition["op"], string> = {
  CONTAINS: "contains",
  STARTS_WITH: "starts with",
  EQUALS: "equals",
  IS_EMPTY: "is empty",
  EQ: "=",
  GT: ">",
  LT: "<",
  GTE: ">=",
  LTE: "<=",
};

const FIELD_LABEL: Record<Condition["field"], string> = {
  DESCRIPTION: "Description",
  REFERENCE: "Reference",
  AMOUNT: "Amount",
};

function defaultOpFor(field: Condition["field"]): Condition["op"] {
  return field === "AMOUNT" ? "EQ" : "CONTAINS";
}

export function RuleForm({
  bankAccounts,
  glAccounts,
  initial,
  onSubmitAction,
  submitLabel,
}: {
  bankAccounts: BankAccountOption[];
  glAccounts: GLAccountOption[];
  initial?: Partial<RuleInput>;
  onSubmitAction: (input: RuleInput) => Promise<unknown>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState((initial?.name as string) ?? "");
  const [bankAccountId, setBankAccountId] = React.useState<string | null>(
    (initial?.bankAccountId as string | null) ?? null
  );
  const [priority, setPriority] = React.useState(
    String(initial?.priority ?? 100)
  );
  const [isActive, setIsActive] = React.useState(
    initial?.isActive === undefined ? true : Boolean(initial.isActive)
  );
  const [conditions, setConditions] = React.useState<Condition[]>(
    (initial?.conditions as Condition[] | undefined) ?? [
      { field: "DESCRIPTION", op: "CONTAINS", value: "" },
    ]
  );
  const [actionGL, setActionGL] = React.useState<string | null>(
    (initial?.actionGlAccountId as string | null) ?? null
  );
  const [notes, setNotes] = React.useState((initial?.actionNotes as string) ?? "");
  const [busy, setBusy] = React.useState(false);

  const glOptions: ComboboxOption[] = glAccounts.map((a) => ({
    value: a.id,
    label: a.code ? `${a.code} · ${a.name}` : a.name,
    hint: a.type.replace("_", " ").toLowerCase(),
  }));

  function addCondition() {
    setConditions((prev) => [
      ...prev,
      { field: "DESCRIPTION", op: "CONTAINS", value: "" },
    ]);
  }

  function updateCondition(idx: number, patch: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const next = { ...c, ...patch };
        // If the field changed type (text ↔ numeric), reset the op so
        // we don't end up with "AMOUNT contains 5".
        if (patch.field && patch.field !== c.field) {
          next.op = defaultOpFor(patch.field);
        }
        return next;
      })
    );
  }

  function removeCondition(idx: number) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this rule a name.";
    if (conditions.length === 0) return "Add at least one condition.";
    for (const c of conditions) {
      if (c.op !== "IS_EMPTY" && c.value.trim() === "") {
        return `Condition on ${FIELD_LABEL[c.field]} needs a value.`;
      }
    }
    if (!actionGL) return "Pick a GL account for the action.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      await onSubmitAction({
        name: name.trim(),
        bankAccountId,
        priority: Number(priority) || 100,
        isActive,
        conditions: conditions.map((c) => ({
          ...c,
          value: c.op === "IS_EMPTY" ? "" : c.value.trim(),
        })),
        combinator: "AND", // v1 — UI doesn't expose OR
        actionGlAccountId: actionGL!,
        actionNotes: notes.trim() || null,
      });
      // onSubmitAction is expected to redirect; if it doesn't, fall back.
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs">
                Rule name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="AWS charges → Cloud Services"
                required
              />
            </div>
            <div>
              <Label className="text-xs">Bank account scope</Label>
              <select
                value={bankAccountId ?? ""}
                onChange={(e) => setBankAccountId(e.target.value || null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All bank accounts</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">
                Priority{" "}
                <span className="text-muted-foreground font-normal">
                  (lower = higher priority)
                </span>
              </Label>
              <Input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                type="number"
                min={0}
                max={9999}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Active
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="text-sm font-medium">Conditions (all must match)</div>
          <ul className="space-y-2">
            {conditions.map((c, idx) => (
              <li key={idx} className="flex gap-2 items-start">
                <select
                  value={c.field}
                  onChange={(e) =>
                    updateCondition(idx, { field: e.target.value as Condition["field"] })
                  }
                  className="flex h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
                >
                  <option value="DESCRIPTION">Description</option>
                  <option value="REFERENCE">Reference</option>
                  <option value="AMOUNT">Amount</option>
                </select>
                <select
                  value={c.op}
                  onChange={(e) =>
                    updateCondition(idx, { op: e.target.value as Condition["op"] })
                  }
                  className="flex h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[120px]"
                >
                  {(c.field === "AMOUNT" ? NUMERIC_OPS : TEXT_OPS).map((op) => (
                    <option key={op} value={op}>
                      {OP_LABEL[op]}
                    </option>
                  ))}
                </select>
                <Input
                  value={c.op === "IS_EMPTY" ? "" : c.value}
                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                  disabled={c.op === "IS_EMPTY"}
                  placeholder={
                    c.op === "IS_EMPTY"
                      ? "(no value)"
                      : c.field === "AMOUNT"
                        ? "e.g. 1000"
                        : "value"
                  }
                  className="flex-1"
                  type={c.field === "AMOUNT" ? "number" : "text"}
                  step={c.field === "AMOUNT" ? "0.01" : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(idx)}
                  disabled={conditions.length === 1}
                  aria-label="Remove condition"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCondition}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> Add condition
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="text-sm font-medium">Then: Categorise to</div>
          <Combobox
            options={glOptions}
            value={actionGL}
            onChange={setActionGL}
            placeholder="Pick a GL account…"
            empty="No matching GL accounts in this org."
          />
          <p className="text-xs text-muted-foreground">
            Pick an Expense / COGS account for Money Out rules, or
            Income / Other Income for Money In rules. Direction is
            checked when the rule fires on import.
          </p>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Memo applied to every record this rule creates"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/banking/rules")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
