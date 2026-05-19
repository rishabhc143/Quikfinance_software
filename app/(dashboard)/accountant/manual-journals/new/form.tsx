"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  AttachFilesField,
  type AttachedFile,
} from "@/components/shared/attach-files-field";
import {
  createManualJournalAndRedirectAction,
  updateManualJournalAndRedirectAction,
  type ManualJournalInput,
} from "../actions";

type Account = { id: string; name: string; code: string | null; type: string };
type Contact = { id: string; displayName: string; type: string };
type Project = { id: string; name: string };
type ReportingTagOption = { id: string; name: string; color: string };
type Line = {
  accountId: string;
  /** ACCT-A.3.b — optional per-line dimensions. "" = no selection. */
  contactId: string;
  projectId: string;
  /** ACCT-A.3.b.2 — selected tag ids (zero or more). */
  tagIds: string[];
  debit: number;
  credit: number;
  description: string;
};

type ReportingMethod = "ACCRUAL_AND_CASH" | "ACCRUAL_ONLY" | "CASH_ONLY";

export type ManualJournalFormInitialValues = {
  date: string; // ISO YYYY-MM-DD
  reverseJournalDate: string; // "" if not set
  publishReverseOnlyOnDate: boolean;
  referenceNumber: string;
  notes: string;
  reportingMethod: ReportingMethod;
  currency: string;
  lines: Line[];
  /** ACCT-A.3.c — initial attachment list (Edit-mode pre-populate). */
  attachments?: AttachedFile[];
};

type Props = {
  accounts: Account[];
  /** ACCT-A.3.b — optional per-line dimension pickers. Empty arrays
   *  hide the corresponding column. */
  contacts?: Contact[];
  projects?: Project[];
  /** ACCT-A.3.b.2 — reporting tags. Empty array hides the column. */
  reportingTags?: ReportingTagOption[];
  currency: string;
  defaultDate: string;
  /** Pre-populate the form for Edit mode. */
  initialValues?: ManualJournalFormInitialValues;
  /** Submit target. */
  mode?: "create" | "edit";
  /** Required when `mode = "edit"`. */
  manualJournalId?: string;
};

/**
 * ACCT-A.3 — Manual Journal form. Used for both Create and Edit (DRAFT-only).
 *
 * Header fields:
 *   - Date *
 *   - Reverse Journal Date (optional) + publish-only-on-date checkbox
 *   - Reference#
 *   - Notes *
 *   - Reporting Method (Accrual and Cash / Accrual Only / Cash Only)
 *   - Currency (defaults to org currency)
 *
 * Lines: balanced DR/CR table with live totals + "Balanced ✓" indicator.
 * Two submit buttons:
 *   - "Save as Draft"     → stores header + lines, no JE posted.
 *   - "Save and Publish"  → stores + posts JE atomically. Auto-reverses
 *                           if `reverseJournalDate` is set.
 */
export function ManualJournalForm({
  accounts,
  contacts = [],
  projects = [],
  reportingTags = [],
  currency: orgCurrency,
  defaultDate,
  initialValues,
  mode = "create",
  manualJournalId,
}: Props) {
  const router = useRouter();
  const showContactCol = contacts.length > 0;
  const showProjectCol = projects.length > 0;
  const showTagsCol = reportingTags.length > 0;

  // Header state
  const [date, setDate] = React.useState(initialValues?.date ?? defaultDate);
  const [reverseDate, setReverseDate] = React.useState(
    initialValues?.reverseJournalDate ?? ""
  );
  const [publishReverseOnlyOnDate, setPublishReverseOnlyOnDate] = React.useState(
    initialValues?.publishReverseOnlyOnDate ?? false
  );
  const [referenceNumber, setReferenceNumber] = React.useState(
    initialValues?.referenceNumber ?? ""
  );
  const [notes, setNotes] = React.useState(initialValues?.notes ?? "");
  const [reportingMethod, setReportingMethod] = React.useState<ReportingMethod>(
    initialValues?.reportingMethod ?? "ACCRUAL_AND_CASH"
  );
  const [currency, setCurrency] = React.useState(
    initialValues?.currency || orgCurrency
  );

  // Lines state
  const [lines, setLines] = React.useState<Line[]>(
    initialValues?.lines?.length
      ? initialValues.lines
      : [
          {
            accountId: "",
            contactId: "",
            projectId: "",
            tagIds: [],
            debit: 0,
            credit: 0,
            description: "",
          },
          {
            accountId: "",
            contactId: "",
            projectId: "",
            tagIds: [],
            debit: 0,
            credit: 0,
            description: "",
          },
        ]
  );
  const [busy, setBusy] = React.useState<null | "draft" | "publish">(null);
  // ACCT-A.3.c — attachment state (data-URL based for v1).
  const [attachments, setAttachments] = React.useState<AttachedFile[]>(
    initialValues?.attachments ?? []
  );

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
        tagIds: [],
        debit: 0,
        credit: 0,
        description: "",
      },
    ]);
  }
  function toggleTag(i: number, tagId: string) {
    setLines((s) =>
      s.map((l, idx) => {
        if (idx !== i) return l;
        const has = l.tagIds.includes(tagId);
        return {
          ...l,
          tagIds: has
            ? l.tagIds.filter((t) => t !== tagId)
            : [...l.tagIds, tagId],
        };
      })
    );
  }
  function removeLine(i: number) {
    if (lines.length > 2) setLines((s) => s.filter((_, idx) => idx !== i));
  }

  function buildInput(saveAsDraft: boolean): ManualJournalInput {
    return {
      date: new Date(date),
      notes: notes || null,
      referenceNumber: referenceNumber.trim() || null,
      reportingMethod,
      currency: currency.trim().toUpperCase() || null,
      reverseJournalDate: reverseDate ? new Date(reverseDate) : null,
      publishReverseOnlyOnDate,
      saveAsDraft,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        contactId: l.contactId || null,
        projectId: l.projectId || null,
        tagIds: l.tagIds,
        debit: l.debit,
        credit: l.credit,
        description: l.description || null,
      })),
      attachments,
    };
  }

  async function save(saveAsDraft: boolean) {
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pick an account on every line");
      return;
    }
    if (!saveAsDraft && !balanced) {
      toast.error("Debits and credits must balance and total > 0");
      return;
    }
    // For drafts we still require totals > 0 if both sides are zero
    // so we never persist a fully empty draft; but we allow off-balance.
    if (saveAsDraft && totalDebit === 0 && totalCredit === 0) {
      toast.error("Add at least one amount before saving");
      return;
    }
    setBusy(saveAsDraft ? "draft" : "publish");
    try {
      const input = buildInput(saveAsDraft);
      if (mode === "edit") {
        if (!manualJournalId) throw new Error("Missing manualJournalId");
        await updateManualJournalAndRedirectAction(manualJournalId, input);
      } else {
        await createManualJournalAndRedirectAction(input);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // The two buttons set busy themselves; preventing the default
    // submit here means hitting "Enter" inside an input doesn't fire
    // the wrong action.
    e.preventDefault();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Date + Reverse Journal Date */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Reverse Journal Date</Label>
              <Input
                type="date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
                min={date}
                placeholder="dd/MM/yyyy"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={publishReverseOnlyOnDate}
                  onChange={(e) => setPublishReverseOnlyOnDate(e.target.checked)}
                />
                Publish reverse journal only on the reverse journal date
                <span title="For v1 the reverse JE is always date-stamped to the reverse date. This checkbox is stored for round-trip fidelity with third-party exports but has no effect on math.">
                  <Info className="h-3 w-3" />
                </span>
              </label>
            </div>
          </div>

          {/* Reference# + Notes */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Reference#</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                maxLength={120}
                placeholder="External doc id / memo"
              />
            </div>
            <div>
              <Label>
                Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Max 500 characters"
                maxLength={500}
                required
              />
            </div>
          </div>

          {/* Reporting Method + Currency */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>
                Reporting Method
                <span
                  className="ml-1 inline-flex"
                  title="Stored on the journal. Cash-basis reports (coming soon) will use this; the current accrual P&L + Trial Balance ignore it."
                >
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </Label>
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
              <p className="text-xs text-muted-foreground mt-1">
                Three-letter ISO code. Defaults to your org currency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-left p-3">Description</th>
                {showContactCol && (
                  <th className="text-left p-3 w-44">Contact</th>
                )}
                {showProjectCol && (
                  <th className="text-left p-3 w-44">Project</th>
                )}
                {showTagsCol && <th className="text-left p-3 w-56">Tags</th>}
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
                            {c.displayName}{" "}
                            <span>({c.type.toLowerCase()})</span>
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
                  {showTagsCol && (
                    <td className="p-2">
                      <TagPicker
                        options={reportingTags}
                        selected={l.tagIds}
                        onToggle={(tagId) => toggleTag(i, tagId)}
                      />
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
                  colSpan={
                    2 +
                    (showContactCol ? 1 : 0) +
                    (showProjectCol ? 1 : 0) +
                    (showTagsCol ? 1 : 0)
                  }
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
                  colSpan={
                    2 +
                    (showContactCol ? 1 : 0) +
                    (showProjectCol ? 1 : 0) +
                    (showTagsCol ? 1 : 0)
                  }
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

      {/* ACCT-A.3.c — Attachments (max 5 × 10 MB). Lives below the
          lines table so the form scrolls naturally from header →
          lines → files → submit. */}
      <Card>
        <CardContent className="pt-6">
          <AttachFilesField
            initial={attachments}
            onChange={setAttachments}
            maxFiles={5}
            maxSizeMb={10}
            label="Attach files to Manual Journal"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/accountant/manual-journals")}
          disabled={busy !== null}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => save(true)}
          disabled={busy !== null}
        >
          {busy === "draft" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save as Draft
        </Button>
        <Button
          type="button"
          onClick={() => save(false)}
          disabled={busy !== null || !balanced}
        >
          {busy === "publish" && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Save and Publish
        </Button>
      </div>
    </form>
  );
}

/**
 * ACCT-A.3.b.2 — Compact multi-select for reporting tags. Renders
 * the selected tags as coloured chips with an inline detach button;
 * a "+ tag" button reveals a dropdown of the remaining options.
 *
 * Lives inside form.tsx because no other surface needs it yet.
 * If a second consumer shows up (per-line tags on Invoices /
 * Bills), promote it to components/shared.
 */
function TagPicker({
  options,
  selected,
  onToggle,
}: {
  options: ReportingTagOption[];
  selected: string[];
  onToggle: (tagId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedSet = new Set(selected);
  const selectedOptions = options.filter((o) => selectedSet.has(o.id));
  const available = options.filter((o) => !selectedSet.has(o.id));

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1 items-center min-h-9 px-1.5 py-1 border border-input rounded-md bg-background">
        {selectedOptions.map((o) => (
          <span
            key={o.id}
            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
            style={{
              backgroundColor: `${o.color}1a`,
              color: o.color,
              border: `1px solid ${o.color}40`,
            }}
          >
            {o.name}
            <button
              type="button"
              onClick={() => onToggle(o.id)}
              className="opacity-70 hover:opacity-100"
              aria-label={`Remove tag ${o.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground px-1"
          >
            {selectedOptions.length === 0 ? "+ tag" : "+"}
          </button>
        )}
      </div>
      {open && available.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-popover shadow-md p-1 w-56">
          {available.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onToggle(o.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: o.color }}
              />
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
