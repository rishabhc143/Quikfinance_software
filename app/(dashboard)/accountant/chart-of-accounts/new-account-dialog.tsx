"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ACCOUNT_TYPE_OPTIONS,
  parseAccountTypeValue,
  type AccountTypeOption,
} from "@/lib/accounting/coa-subtypes";
import { createAccountAction } from "./actions";

const DEFAULT_VALUE = "ASSET:Other Asset";

/**
 * ACCT-E.3 — Zoho-style "Create Account" modal.
 *
 * Replaces the old `+ New` page link. A single Account Type
 * dropdown surfaces every granular sub-type (Cash / Bank / Other
 * Asset / etc.) at once; a contextual help panel on the right
 * shows the broad-type heading + one-line description for the
 * currently-selected option.
 *
 * Submit posts to the existing `createAccountAction` after the
 * combined `TYPE:SUBTYPE` value is split into separate FormData
 * entries the action expects.
 */
export function NewAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountTypeValue, setAccountTypeValue] =
    React.useState(DEFAULT_VALUE);
  const [busy, setBusy] = React.useState(false);

  const opt: AccountTypeOption =
    ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountTypeValue) ??
    ACCOUNT_TYPE_OPTIONS[0];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = e.currentTarget;
      const data = new FormData(form);
      // Split the combined value into the (type, subType) pair the
      // server action's Zod schema expects.
      const parsed = parseAccountTypeValue(
        String(data.get("accountTypeValue") ?? "")
      );
      if (!parsed) {
        toast.error("Pick a valid account type.");
        setBusy(false);
        return;
      }
      data.set("type", parsed.type);
      data.set("subType", parsed.subType);
      data.delete("accountTypeValue");
      data.delete("watchlist"); // watchlist field is UI-only for v1

      await createAccountAction(data);
      // createAccountAction calls `redirect("/accountant/chart-of-accounts")`,
      // which throws a NEXT_REDIRECT marker — caught below as success.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.startsWith("NEXT_REDIRECT")) {
        toast.success("Account created");
        setOpen(false);
        router.refresh();
        setBusy(false);
        return;
      }
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setAccountTypeValue(DEFAULT_VALUE);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-base font-semibold">
            Create Account
          </DialogTitle>
          {/* Note: <DialogContent> already renders its own X close
              button (components/ui/dialog.tsx). Don't add another
              one here — that was the dup-close bug. */}
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6 p-6">
            {/* ── Left: form fields ────────────────────────── */}
            <div className="space-y-4">
              <div>
                <Label className="text-destructive">
                  Account Type<span aria-hidden>*</span>
                </Label>
                <select
                  name="accountTypeValue"
                  value={accountTypeValue}
                  onChange={(e) => setAccountTypeValue(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  {ACCOUNT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-destructive">
                  Account Name<span aria-hidden>*</span>
                </Label>
                <Input name="name" required maxLength={120} />
              </div>

              <div>
                <Label className="border-b border-dotted">Account Code</Label>
                <Input
                  name="code"
                  maxLength={20}
                  placeholder="Optional (e.g. 6300)"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  name="description"
                  rows={4}
                  maxLength={500}
                  placeholder="Max. 500 characters"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-sm cursor-pointer pt-1">
                <input
                  type="checkbox"
                  name="watchlist"
                  className="h-4 w-4"
                />
                Add to the watchlist on my dashboard
              </label>
              {/* Watchlist persistence comes with the dashboard
                  widget — UI-only stub for v1 parity with Zoho. */}
            </div>

            {/* ── Right: contextual help panel ─────────────── */}
            <div className="hidden md:block">
              <div className="relative inline-block">
                <div className="rounded-md bg-slate-900 text-slate-50 p-4 text-sm shadow-md">
                  <div className="flex items-start gap-2 mb-1">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-80" />
                    <div className="font-semibold">{opt.groupHeader}</div>
                  </div>
                  <p className="text-slate-300 text-[13px] leading-snug">
                    {opt.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-start gap-2 border-t p-4 bg-muted/20">
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
