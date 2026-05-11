"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { gstinErrors } from "@/lib/validators/gstin";
import type { VendorInput } from "./actions";

/**
 * P2-A: Minimal Vendor form so the /new and /edit routes resolve.
 * The full 7-tab form (Other Details / Address / Contact Persons /
 * Bank Details / Custom Fields / Reporting Tags / Remarks) lands in
 * P2-B. This v1 captures only the primary-contact + company-info
 * essentials + a minimal bank-account block.
 *
 * Fields exposed:
 *   - Primary contact: salutation / first / last
 *   - Company: companyName
 *   - Display name (required, unique)
 *   - Email, work phone, mobile
 *   - GSTIN, PAN, place of supply
 *   - MSME registered + number/category/date (revealed when checked)
 *   - Currency
 *   - One bank account (account holder / bank name / account no / IFSC)
 *   - Notes (Remarks)
 */
export function VendorForm({
  initial,
  action,
  submitLabel,
}: {
  initial?: Partial<VendorInput> & { id?: string };
  action: (input: VendorInput) => Promise<unknown>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  type BankRow = NonNullable<VendorInput["bankAccounts"]>[number];
  const [v, setV] = React.useState<VendorInput>({
    salutation: initial?.salutation ?? "",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    companyName: initial?.companyName ?? "",
    displayName: initial?.displayName ?? "",
    email: initial?.email ?? "",
    workPhone: initial?.workPhone ?? "",
    workPhoneCountry: initial?.workPhoneCountry ?? "+91",
    mobile: initial?.mobile ?? "",
    mobileCountry: initial?.mobileCountry ?? "+91",
    language: initial?.language ?? "en",
    pan: initial?.pan ?? "",
    gstin: initial?.gstin ?? "",
    gstTreatment: initial?.gstTreatment ?? "",
    placeOfSupply: initial?.placeOfSupply ?? "",
    taxPreference: initial?.taxPreference ?? "",
    currency: initial?.currency ?? "INR",
    accountsPayableId: initial?.accountsPayableId ?? "",
    openingBalance: initial?.openingBalance ?? 0,
    paymentTermsId: initial?.paymentTermsId ?? "",
    defaultTdsId: initial?.defaultTdsId ?? "",
    enableVendorPortal: initial?.enableVendorPortal ?? false,
    msmeRegistered: initial?.msmeRegistered ?? false,
    msmeNumber: initial?.msmeNumber ?? "",
    msmeCategory: initial?.msmeCategory ?? "",
    msmeRegisteredDate: initial?.msmeRegisteredDate ?? "",
    notes: initial?.notes ?? "",
    bankAccounts: initial?.bankAccounts ?? [],
  });

  function set<K extends keyof VendorInput>(k: K, val: VendorInput[K]) {
    setV((s) => ({ ...s, [k]: val }));
  }

  // Auto-suggest displayName when first/last/company change and the
  // user hasn't manually edited it yet.
  const displayNameTouched = React.useRef(!!initial?.displayName);
  React.useEffect(() => {
    if (displayNameTouched.current) return;
    const composed =
      v.companyName ||
      [v.firstName, v.lastName].filter(Boolean).join(" ") ||
      "";
    if (composed) set("displayName", composed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.firstName, v.lastName, v.companyName]);

  const gstWarning =
    v.gstin && v.gstin.length > 0 ? gstinErrors(v.gstin)[0] : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(v);
      toast.success("Vendor saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Primary contact */}
      <Section title="Primary contact">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Salutation">
            <Input
              value={v.salutation ?? ""}
              onChange={(e) => set("salutation", e.target.value)}
              placeholder="Mr. / Ms. / Mrs."
            />
          </Field>
          <Field label="First name">
            <Input
              value={v.firstName ?? ""}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <Input
              value={v.lastName ?? ""}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2 mt-3">
          <Field label="Company name">
            <Input
              value={v.companyName ?? ""}
              onChange={(e) => set("companyName", e.target.value)}
            />
          </Field>
          <Field label="Display name" required>
            <Input
              value={v.displayName}
              onChange={(e) => {
                displayNameTouched.current = true;
                set("displayName", e.target.value);
              }}
              required
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <Field label="Email">
            <Input
              type="email"
              value={v.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Work phone">
            <Input
              value={v.workPhone ?? ""}
              onChange={(e) => set("workPhone", e.target.value)}
            />
          </Field>
          <Field label="Mobile">
            <Input
              value={v.mobile ?? ""}
              onChange={(e) => set("mobile", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* Tax + identity */}
      <Section title="Tax & identity">
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="GSTIN"
            hint={gstWarning ?? (v.gstin ? "✓ Looks valid" : undefined)}
            hintTone={gstWarning ? "warn" : v.gstin ? "ok" : undefined}
          >
            <Input
              value={v.gstin ?? ""}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              className="uppercase font-mono"
              maxLength={15}
            />
          </Field>
          <Field label="PAN">
            <Input
              value={v.pan ?? ""}
              onChange={(e) => set("pan", e.target.value.toUpperCase())}
              placeholder="AAAAA0000A"
              className="uppercase font-mono"
              maxLength={10}
            />
          </Field>
          <Field label="Place of supply (state code)">
            <Input
              value={v.placeOfSupply ?? ""}
              onChange={(e) => set("placeOfSupply", e.target.value)}
              placeholder="e.g. 27 for Maharashtra"
              maxLength={2}
            />
          </Field>
        </div>
      </Section>

      {/* MSME */}
      <Section title="MSME registration">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!v.msmeRegistered}
            onChange={(e) => set("msmeRegistered", e.target.checked)}
          />
          This vendor is MSME registered
        </label>
        {v.msmeRegistered ? (
          <div className="grid gap-3 md:grid-cols-3 mt-3">
            <Field label="MSME number">
              <Input
                value={v.msmeNumber ?? ""}
                onChange={(e) => set("msmeNumber", e.target.value)}
              />
            </Field>
            <Field label="Category">
              <select
                value={v.msmeCategory ?? ""}
                onChange={(e) => set("msmeCategory", e.target.value || null)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— Select —</option>
                <option value="MICRO">Micro</option>
                <option value="SMALL">Small</option>
                <option value="MEDIUM">Medium</option>
              </select>
            </Field>
            <Field label="Registration date">
              <Input
                type="date"
                value={(v.msmeRegisteredDate as string) ?? ""}
                onChange={(e) => set("msmeRegisteredDate", e.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </Section>

      {/* Bank accounts */}
      <Section title="Bank account">
        <div className="space-y-3">
          {(v.bankAccounts ?? []).map((b, i) => (
            <div
              key={i}
              className="grid gap-3 md:grid-cols-4 items-end rounded border p-3"
            >
              <Field label="Holder name">
                <Input
                  value={b.accountHolderName ?? ""}
                  onChange={(e) =>
                    set(
                      "bankAccounts",
                      (v.bankAccounts ?? []).map((row, idx) =>
                        idx === i
                          ? { ...row, accountHolderName: e.target.value }
                          : row
                      )
                    )
                  }
                />
              </Field>
              <Field label="Bank name">
                <Input
                  value={b.bankName ?? ""}
                  onChange={(e) =>
                    set(
                      "bankAccounts",
                      (v.bankAccounts ?? []).map((row, idx) =>
                        idx === i ? { ...row, bankName: e.target.value } : row
                      )
                    )
                  }
                />
              </Field>
              <Field label="Account #" required>
                <Input
                  type="password"
                  value={b.accountNumber}
                  onChange={(e) =>
                    set(
                      "bankAccounts",
                      (v.bankAccounts ?? []).map((row, idx) =>
                        idx === i
                          ? { ...row, accountNumber: e.target.value }
                          : row
                      )
                    )
                  }
                  required
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="IFSC" required>
                  <Input
                    value={b.ifscCode}
                    onChange={(e) =>
                      set(
                        "bankAccounts",
                        (v.bankAccounts ?? []).map((row, idx) =>
                          idx === i
                            ? {
                                ...row,
                                ifscCode: e.target.value.toUpperCase(),
                              }
                            : row
                        )
                      )
                    }
                    placeholder="HDFC0001234"
                    className="uppercase font-mono"
                    maxLength={11}
                    required
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    set(
                      "bankAccounts",
                      (v.bankAccounts ?? []).filter((_, idx) => idx !== i)
                    )
                  }
                  aria-label="Remove bank account"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set("bankAccounts", [
                ...(v.bankAccounts ?? []),
                {
                  accountHolderName: "",
                  bankName: "",
                  accountNumber: "",
                  ifscCode: "",
                  isDefault: (v.bankAccounts ?? []).length === 0,
                } as BankRow,
              ])
            }
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> Add bank account
          </Button>
        </div>
      </Section>

      {/* Vendor-portal access */}
      <Section title="Portal access">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!v.enableVendorPortal}
            onChange={(e) => set("enableVendorPortal", e.target.checked)}
          />
          Allow portal access for this vendor (UI lands in a follow-up)
        </label>
      </Section>

      <Section title="Remarks">
        <Textarea
          value={v.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
        />
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border bg-card p-4">
      <legend className="px-2 text-sm font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  hint,
  hintTone,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string | null;
  hintTone?: "ok" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {hint ? (
        <p
          className={
            "text-xs " +
            (hintTone === "warn"
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400")
          }
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
