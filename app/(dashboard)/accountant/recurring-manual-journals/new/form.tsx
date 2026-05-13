"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  createRecurringManualJournalAndRedirectAction,
  type RecurringManualJournalInput,
} from "../actions";

type Account = { id: string; name: string; code: string | null; type: string };
type Contact = { id: string; displayName: string; type: string };
type Project = { id: string; name: string };

type Line = {
  accountId: string;
  contactId: string;
  projectId: string;
  debit: number;
  credit: number;
  description: string;
};

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type ReportingMethod = "ACCRUAL_AND_CASH" | "ACCRUAL_ONLY" | "CASH_ONLY";

export type RecurringFormInitialValues = {
  profileName: string;
  frequency: Frequency;
  intervalN: number;
  startDate: string;
  endDate: string;
  neverExpires: boolean;
  referenceNumber: string;
  reportingMethod: ReportingMethod;
  currency: string;
  notes: string;
  lines: Line[];
};

type Props = {
  accounts: Account[];
  contacts?: Contact[];
  projects?: Project[];
  currency: string;
  defaultDate: string;
  /** Pre-populate from a source MJ ("Make Recurring" button). */
  initialValues?: RecurringFormInitialValues;
};

/**
 * ACCT-A.4.c — Recurring Manual Journal create form.
 *
 * Header captures the SCHEDULE (profileName, frequency, intervalN,
 * start/end dates, neverExpires) plus the same MJ header fields
 * (referenceNumber, reportingMethod, currency, notes) that get
 * baked into every generated occurrence. Lines table is identical
 * to the regular MJ form, so muscle memory carries over.
 */
export function RecurringManualJournalForm({
  accounts,
  contacts = [],
  projects = [],
  currency: orgCurrency,
  defaultDate,
  initialValues,
}: Props) {
  const router = useRouter();
  const showContactCol = contacts.length > 0;
  const showProjectCol = projects.length > 0;

  // Schedule + header
  const [profileName, setProfileName] = React.useState(
    initialValues?.profileName ?? ""
  );
  const [frequency, setFrequency] = React.useState<Frequency>(
    initialValues?.frequency ?? "monthly"
  );
  const [intervalN, setIntervalN] = React.useState<number>(
    initialValues?.intervalN ?? 1
  );
  const [startDate, setStartDate] = React.useState(
    initialValues?.startDate ?? defaultDate
  );
  const [endDate, setEndDate] = React.useState(initialValues?.endDate ?? "");
  const [neverExpires, setNeverExpires] = React.useState(
    initialValues?.neverExpires ?? false
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initialValues?.referenceNumber ?? ""
  );
  const [reportingMethod, setReportingMethod] = React.useState<ReportingMethod>(
    initialValues?.reportingMethod ?? "ACCRUAL_AND_CASH"
  );
  const [currency, setCurrency] = React.useState(
    initialValues?.currency || orgCurrency
  );
  const [notes, setNotes] = React.useState(initialValues?.notes ?? "");

  // Lines
  const [lines, setLines] = React.useState<Line[]>(
    initialValues?.lines?.length
      ? initialValues.lines
      : [
          {
            accountId: "",
            contactId: "",
            projectId: "",
            debit: 0,
            credit: 0,
            description: "",
          },
          {
            accountId: "",
            contactId: "",
            projectId: "",
            debit: 0,
            credit: 0,
            description: "",
          },
        ]
  );
  const [busy, setBusy] = React.useState(false);

  const totalDebit = lines.reduce(
    (s, l) => s + (Number.isFinite(l.debit) ? l.debit : 0),
    0
  );
  const totalCredit = lines.reduce(
    (s, l) => s + (Number.isFinite(l.credit) ? l.credit : 0),
    0
  );
  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 0.001 && totalDebit > 0;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((s) => [
      ...s,
      {
        accountId: "",
        contactId: "",
        projectId: "",
        debit: 0,
        credit: 0,
        description: "",
      },
    ]);
  }
  function removeLine(i: number) {
    if (lines.length > 2) setLines((s) => s.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name the recurring profile");
      return;
    }
    if (!balanced) {
      toast.error("Debits and credits must balance and total > 0");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pick an account on every line");
      return;
    }
    if (!neverExpires && endDate && new Date(endDate) < new Date(startDate)) {
      toast.error("End date must be after start date");
      return;
    }
    setBusy(true);
    try {
      const input: RecurringManualJournalInput = {
        profileName: profileName.trim(),
        frequency,
        intervalN,
        startDate: new Date(startDate),
        endDate: neverExpires || !endDate ? null : new Date(endDate),
        neverExpires,
        referenceNumber: referenceNumber.trim() || null,
        reportingMethod,
        currency: currency.trim().toUpperCase() || null,
        notes: notes || null,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          contactId: l.contactId || null,
          projectId: l.projectId || null,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
        })),
      };
      await createRecurringManualJournalAndRedirectAction(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>
              Profile name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g. Monthly Rent Accrual"
              maxLength={160}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown on the list page + audit log. The generated MJ
              numbers use your normal Manual Journal sequence.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>
                Frequency <span className="text-destructive">*</span>
              </Label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <Label>Repeat every</Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={intervalN}
                onChange={(e) =>
                  setIntervalN(Math.max(1, Number(e.target.value)))
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                e.g. <code className="text-xs">3</code> + Monthly = every
                3 months
              </p>
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={neverExpires}
                  onCheckedChange={(v) => setNeverExpires(v === true)}
                />
                <span className="text-sm">Never expires</span>
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>
                Start date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                disabled={neverExpires}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Reference#</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                maxLength={120}
                placeholder="Applied to every occurrence"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value.toUpperCase().slice(0, 3))
                }
                maxLength={3}
                placeholder="INR"
                className="md:max-w-[150px] uppercase tracking-wider"
              />
            </div>
          </div>

          <div>
            <Label>Reporting Method</Label>
            <div className="flex gap-3 mt-1.5">
              {(
                [
                  ["ACCRUAL_AND_CASH", "Accrual and Cash"],
                  ["ACCRUAL_ONLY", "Accrual Only"],
                  ["CASH_ONLY", "Cash Only"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="inline-flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="reportingMethod"
                    value={value}
                    checked={reportingMethod === value}
                    onChange={() => setReportingMethod(value)}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Applied to every occurrence (max 500 chars)"
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-left p-3">Description</th>
                {showContactCol && <th className="text-left p-3 w-44">Contact</th>}
                {showProjectCol && <th className="text-left p-3 w-44">Project</th>}
                <th className="text-right p-3 w-32">Debit</th>
                <th className="text-right p-3 w-32">Credit</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="p-2">
                    <select
                      value={l.accountId}
                      onChange={(e) => setLine(i, { accountId: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      required
                    >
                      <option value="">Select…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code ? `${a.code} · ` : ""}
                          {a.name} ({a.type.toLowerCase().replace("_", " ")})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={l.description}
                      onChange={(e) =>
                        setLine(i, { description: e.target.value })
                      }
                      className="h-9"
                    />
                  </td>
                  {showContactCol && (
                    <td className="p-2">
                      <select
                        value={l.contactId}
                        onChange={(e) =>
                          setLine(i, { contactId: e.target.value })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName} ({c.type.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  {showProjectCol && (
                    <td className="p-2">
                      <select
                        value={l.projectId}
                        onChange={(e) =>
                          setLine(i, { projectId: e.target.value })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.debit || ""}
                      onChange={(e) =>
                        setLine(i, { debit: Number(e.target.value), credit: 0 })
                      }
                      className="h-9 text-right"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.credit || ""}
                      onChange={(e) =>
                        setLine(i, { credit: Number(e.target.value), debit: 0 })
                      }
                      className="h-9 text-right"
                    />
                  </td>
                  <td className="p-2">
                    {lines.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20 text-sm">
              <tr>
                <td
                  colSpan={2 + (showContactCol ? 1 : 0) + (showProjectCol ? 1 : 0)}
                  className="p-3 text-right"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add line
                  </Button>
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {formatMoney(totalDebit, currency || orgCurrency)}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {formatMoney(totalCredit, currency || orgCurrency)}
                </td>
                <td />
              </tr>
              <tr>
                <td
                  colSpan={2 + (showContactCol ? 1 : 0) + (showProjectCol ? 1 : 0)}
                  className={
                    "p-3 text-right text-xs " +
                    (balanced ? "text-emerald-600" : "text-destructive")
                  }
                >
                  {balanced
                    ? "Balanced ✓"
                    : `Off by ${formatMoney(Math.abs(diff), currency || orgCurrency)}`}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/accountant/recurring-manual-journals")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !balanced}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Recurring Profile
        </Button>
      </div>
    </form>
  );
}
