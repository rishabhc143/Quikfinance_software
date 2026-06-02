"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistoryInput } from "@/components/ui/history-input";
import { PincodeInput } from "@/components/ui/pincode-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/shared/money-input";
import { PartnerBankPromo } from "@/components/shared/partner-bank-promo";
import { ContactPersonsTable } from "@/components/shared/contact-persons-table";
import { gstinErrors } from "@/lib/validators/gstin";
import type { VendorInput } from "./actions";

/**
 * P2-B full 7-tab Vendor form.
 *
 * Tabs (per master prompt's <vendors_spec>):
 *   - Other Details (default) — PAN / MSME / Currency / A/P account /
 *     Opening Balance / Payment Terms / TDS / Portal / GST extras
 *     (collapsible)
 *   - Address — Billing | Shipping side-by-side, "Copy billing to
 *     shipping" link
 *   - Contact Persons — inline editable table, primary radio
 *   - Bank Details — multi-account, account-number eye-toggle,
 *     re-enter validation, IFSC regex, partner-bank promo on right
 *   - Custom Fields / Reporting Tags — stub-with-link cards (config
 *     elsewhere; renderer reused from Customer)
 *   - Remarks — free-form notes
 *
 * Mirrors `app/(dashboard)/sales/customers/customer-form.tsx` for
 * consistency. Uses react-hook-form + the existing zod schema in
 * `./actions` for validation.
 */

const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr.", ""] as const;
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "bn", label: "Bengali" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
];
const MSME_CATEGORIES: ComboboxOption[] = [
  { value: "MICRO", label: "Micro" },
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
];

const blankAddress = {
  kind: "billing" as const,
  attention: "",
  country: "India",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zipCode: "",
  phone: "",
  fax: "",
  isDefault: false,
};


const blankBank = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  reEnteredAccountNumber: "",
  ifscCode: "",
  isDefault: false,
};

export type VendorFormProps = {
  initial?: Partial<VendorInput> & { id?: string };
  paymentTermsOptions?: ComboboxOption[];
  accountsPayableOptions?: ComboboxOption[];
  tdsOptions?: ComboboxOption[];
  action: (input: VendorInput) => Promise<unknown>;
  submitLabel: string;
  cancelHref?: string;
};

function GstinValidationHint({ value }: { value: string }) {
  const v = (value ?? "").trim();
  if (v.length === 0) return null;
  const errors = gstinErrors(v);
  if (errors.length === 0) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        ✓ Valid GSTIN format
      </p>
    );
  }
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">{errors[0]}</p>
  );
}

export function VendorForm({
  initial,
  paymentTermsOptions = [],
  accountsPayableOptions = [],
  tdsOptions = [],
  action,
  submitLabel,
  cancelHref = "/purchases/vendors",
}: VendorFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);
  const [showAcctNos, setShowAcctNos] = React.useState<Record<number, boolean>>(
    {}
  );

  const form = useForm<VendorInput>({
    defaultValues: {
      salutation: "",
      firstName: "",
      lastName: "",
      companyName: "",
      displayName: "",
      email: "",
      workPhone: "",
      workPhoneCountry: "+91",
      mobile: "",
      mobileCountry: "+91",
      language: "en",
      pan: "",
      gstin: "",
      gstTreatment: "",
      placeOfSupply: "",
      taxPreference: "taxable",
      currency: "INR",
      accountsPayableId: "",
      openingBalance: 0,
      paymentTermsId: "",
      defaultTdsId: "",
      enableVendorPortal: false,
      msmeRegistered: false,
      msmeNumber: "",
      msmeCategory: "",
      msmeRegisteredDate: "",
      websiteUrl: "",
      facebookUrl: "",
      twitterHandle: "",
      notes: "",
      bankAccounts: [],
      addresses: [],
      contactPersons: [],
      ...(initial ?? {}),
    },
  });

  const addresses = useFieldArray({
    control: form.control,
    name: "addresses",
  });
  // CRIT-2 audit: `persons` field array moved inside `<ContactPersonsTable>`.
  const banks = useFieldArray({
    control: form.control,
    name: "bankAccounts",
  });

  // Seed the two canonical address rows (Billing + Shipping) on
  // first mount when the form is creating a new vendor.
  React.useEffect(() => {
    if (addresses.fields.length === 0) {
      addresses.append({
        ...blankAddress,
        kind: "billing",
        isDefault: true,
      });
      addresses.append({ ...blankAddress, kind: "shipping" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-suggest display name combinations as the user types.
  const firstName = form.watch("firstName");
  const lastName = form.watch("lastName");
  const salutation = form.watch("salutation");
  const companyName = form.watch("companyName");
  const displayNameSuggestions = React.useMemo(() => {
    const out = new Set<string>();
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (name) {
      out.add(name);
      if (salutation) out.add(`${salutation} ${name}`);
    }
    if (lastName && firstName) out.add(`${lastName}, ${firstName}`);
    if (companyName) out.add(companyName);
    return Array.from(out);
  }, [firstName, lastName, salutation, companyName]);

  const msmeRegistered = form.watch("msmeRegistered");

  function copyBillingToShipping() {
    const all = form.getValues("addresses") ?? [];
    const billing = all.find((a) => a?.kind === "billing");
    if (!billing) return;
    const shippingIdx = all.findIndex((a) => a?.kind === "shipping");
    const next = {
      ...billing,
      kind: "shipping" as const,
      isDefault: false,
    };
    if (shippingIdx >= 0) addresses.update(shippingIdx, next);
    else addresses.append(next);
    toast.success("Copied billing address to shipping");
  }

  async function onSubmit(values: VendorInput) {
    setBusy(true);
    try {
      await action(values);
      toast.success("Vendor saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* ───── Top fixed section ───── */}
      <section className="space-y-4 rounded-md border bg-card p-6">
        <div className="grid gap-3 md:grid-cols-[10rem_1fr] items-start">
          <Label className="pt-2">Primary contact</Label>
          <div className="grid gap-2 md:grid-cols-3">
            <Controller
              name="salutation"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={SALUTATIONS.map((s) => ({
                    value: s,
                    label: s || "—",
                  }))}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Salutation"
                />
              )}
            />
            <HistoryInput
              autofillKey="contact.firstName"
              placeholder="First name"
              autoFocus
              {...form.register("firstName")}
            />
            <HistoryInput autofillKey="contact.lastName" placeholder="Last name" {...form.register("lastName")} />
          </div>

          <Label className="pt-2">Company name</Label>
          <HistoryInput
            autofillKey="contact.companyName"
            {...form.register("companyName")}
            placeholder="Company name"
          />

          <Label className="pt-2" htmlFor="displayName">
            Display name *
          </Label>
          <div>
            <Controller
              name="displayName"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={[
                    ...displayNameSuggestions.map((s) => ({
                      value: s,
                      label: s,
                    })),
                    ...(field.value &&
                    !displayNameSuggestions.includes(field.value)
                      ? [{ value: field.value, label: field.value }]
                      : []),
                  ]}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Vendor display name"
                  allowCreate
                  onCreate={(input) => field.onChange(input)}
                />
              )}
            />
            {form.formState.errors.displayName ? (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.displayName.message}
              </p>
            ) : null}
          </div>

          <Label className="pt-2" htmlFor="email">
            Email address
          </Label>
          <Input
            type="email"
            {...form.register("email")}
            placeholder="email@example.com"
          />

          <Label className="pt-2">Phone</Label>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex gap-2">
              <Input
                {...form.register("workPhoneCountry")}
                className="w-20"
                placeholder="+91"
              />
              <Input
                {...form.register("workPhone")}
                placeholder="Work phone"
              />
            </div>
            <div className="flex gap-2">
              <Input
                {...form.register("mobileCountry")}
                className="w-20"
                placeholder="+91"
              />
              <Input {...form.register("mobile")} placeholder="Mobile" />
            </div>
          </div>

          <Label className="pt-2">Vendor language</Label>
          <Controller
            name="language"
            control={form.control}
            render={({ field }) => (
              <Combobox
                options={LANGUAGES}
                value={field.value ?? "en"}
                onChange={(v) => field.onChange(v ?? "en")}
              />
            )}
          />
        </div>
      </section>

      {/* ───── Tabs ───── */}
      <Tabs defaultValue="other" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="other">Other Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="persons">Contact Persons</TabsTrigger>
          <TabsTrigger value="bank">Bank Details</TabsTrigger>
          <TabsTrigger value="custom">Custom Fields</TabsTrigger>
          <TabsTrigger value="tags">Reporting Tags</TabsTrigger>
          <TabsTrigger value="remarks">Remarks</TabsTrigger>
        </TabsList>

        {/* ─── Other Details ─── */}
        <TabsContent value="other" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[10rem_1fr] items-start">
            <Label className="pt-2">PAN</Label>
            <div>
              <Input
                {...form.register("pan")}
                placeholder="ABCDE1234F"
                className="uppercase"
                maxLength={10}
              />
              {form.formState.errors.pan ? (
                <p className="mt-1 text-xs text-destructive">
                  {form.formState.errors.pan.message}
                </p>
              ) : null}
            </div>

            <Label className="pt-2">MSME registered?</Label>
            <div className="space-y-3">
              <Controller
                name="msmeRegistered"
                control={form.control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                    />
                    <span className="text-sm text-muted-foreground">
                      This vendor is MSME registered
                    </span>
                  </div>
                )}
              />
              {msmeRegistered ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    {...form.register("msmeNumber")}
                    placeholder="MSME / Udyam number"
                  />
                  <Controller
                    name="msmeCategory"
                    control={form.control}
                    render={({ field }) => (
                      <Combobox
                        options={MSME_CATEGORIES}
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v ?? "")}
                        placeholder="Category"
                      />
                    )}
                  />
                  <Input
                    type="date"
                    {...form.register("msmeRegisteredDate")}
                  />
                </div>
              ) : null}
              {form.formState.errors.msmeNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.msmeNumber.message}
                </p>
              ) : null}
            </div>

            <Label className="pt-2">Currency</Label>
            <HistoryInput
              autofillKey="contact.currency"
              {...form.register("currency")}
              placeholder="INR"
              className="uppercase"
              maxLength={3}
            />

            <Label className="pt-2">Accounts payable</Label>
            <Controller
              name="accountsPayableId"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={accountsPayableOptions}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder={
                    accountsPayableOptions.length === 0
                      ? "Default A/P account"
                      : "Choose A/P account"
                  }
                />
              )}
            />

            <Label className="pt-2">Opening balance</Label>
            <div>
              <Controller
                name="openingBalance"
                control={form.control}
                render={({ field }) => (
                  <MoneyInput
                    value={field.value ?? ""}
                    onChange={(v) =>
                      field.onChange(v === "" ? null : Number(v))
                    }
                    currencyCode="INR"
                    allowNegative
                  />
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Positive = you owe the vendor. Negative = vendor owes you.
              </p>
            </div>

            <Label className="pt-2">Payment terms</Label>
            <Controller
              name="paymentTermsId"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={paymentTermsOptions}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Due on Receipt"
                />
              )}
            />

            <Label className="pt-2">TDS</Label>
            <Controller
              name="defaultTdsId"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={tdsOptions}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder={
                    tdsOptions.length === 0
                      ? "No TDS taxes configured"
                      : "Select TDS"
                  }
                />
              )}
            />

            <Label className="pt-2 flex items-start gap-2">
              <span>Enable portal?</span>
            </Label>
            <Controller
              name="enableVendorPortal"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!field.value}
                    onCheckedChange={field.onChange}
                  />
                  <span className="text-sm text-muted-foreground">
                    Allow portal access for this vendor
                  </span>
                </div>
              )}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowMore((s) => !s)}
              className="text-sm text-primary hover:underline"
            >
              {showMore ? "− Hide additional details" : "+ Add more details"}
            </button>
          </div>
          {showMore ? (
            <div className="grid gap-3 md:grid-cols-[10rem_1fr] items-start border-t pt-4">
              <Label className="pt-2">Tax preference</Label>
              <Controller
                name="taxPreference"
                control={form.control}
                render={({ field }) => (
                  <Combobox
                    options={[
                      { value: "taxable", label: "Taxable" },
                      { value: "tax_exempt", label: "Tax Exempt" },
                    ]}
                    value={field.value ?? "taxable"}
                    onChange={(v) => field.onChange(v ?? "taxable")}
                  />
                )}
              />

              <Label className="pt-2">GSTIN</Label>
              <div className="space-y-1">
                <Input
                  {...form.register("gstin")}
                  placeholder="22AAAAA0000A1Z5"
                  className="uppercase"
                  maxLength={15}
                />
                <GstinValidationHint value={form.watch("gstin") ?? ""} />
              </div>

              <Label className="pt-2">GST treatment</Label>
              <Controller
                name="gstTreatment"
                control={form.control}
                render={({ field }) => (
                  <Combobox
                    options={[
                      { value: "registered", label: "Registered Business" },
                      {
                        value: "unregistered",
                        label: "Unregistered Business",
                      },
                      { value: "composition", label: "Composition Scheme" },
                      { value: "consumer", label: "Consumer" },
                      { value: "overseas", label: "Overseas" },
                    ]}
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                  />
                )}
              />

              <Label className="pt-2">Place of supply</Label>
              <HistoryInput
                autofillKey="address.state"
                {...form.register("placeOfSupply")}
                placeholder="State name"
              />

              <Label className="pt-2">Website</Label>
              <Input
                {...form.register("websiteUrl")}
                placeholder="https://"
              />

              <Label className="pt-2">Twitter</Label>
              <Input
                {...form.register("twitterHandle")}
                placeholder="@handle"
              />

              <Label className="pt-2">Facebook</Label>
              <Input
                {...form.register("facebookUrl")}
                placeholder="https://facebook.com/..."
              />
            </div>
          ) : null}
        </TabsContent>

        {/* ─── Address ─── */}
        <TabsContent value="address" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["billing", "shipping"] as const).map((kind) => {
              const idx = addresses.fields.findIndex((a) => a.kind === kind);
              if (idx === -1) return null;
              return (
                <div
                  key={kind}
                  className="rounded-md border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize">
                      {kind} address
                    </h3>
                    {kind === "shipping" ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={copyBillingToShipping}
                      >
                        ↓ Copy billing address
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Attention"
                    {...form.register(`addresses.${idx}.attention`)}
                  />
                  <HistoryInput
                    autofillKey="address.country"
                    placeholder="Country / Region"
                    {...form.register(`addresses.${idx}.country`)}
                  />
                  <Textarea
                    placeholder="Street 1"
                    rows={2}
                    {...form.register(`addresses.${idx}.addressLine1`)}
                  />
                  <Textarea
                    placeholder="Street 2"
                    rows={2}
                    {...form.register(`addresses.${idx}.addressLine2`)}
                  />
                  <div className="grid gap-2 md:grid-cols-3">
                    <HistoryInput
                      autofillKey="address.city"
                      placeholder="City"
                      {...form.register(`addresses.${idx}.city`)}
                    />
                    <HistoryInput
                      autofillKey="address.state"
                      placeholder="State"
                      {...form.register(`addresses.${idx}.state`)}
                    />
                    <PincodeInput
                      autofillKey="address.zipCode"
                      placeholder="Pin code"
                      {...form.register(`addresses.${idx}.zipCode`)}
                      onResolved={(r) => {
                        form.setValue(`addresses.${idx}.city`, r.city);
                        form.setValue(`addresses.${idx}.state`, r.state);
                        form.setValue(`addresses.${idx}.country`, r.country);
                      }}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      placeholder="Phone"
                      {...form.register(`addresses.${idx}.phone`)}
                    />
                    <Input
                      placeholder="Fax"
                      {...form.register(`addresses.${idx}.fax`)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
            Adding more than two addresses? Save the vendor first, then
            manage extra addresses from the Vendors list. PDF customization
            picks the default address.
          </div>
        </TabsContent>

        {/* ─── Contact Persons ─── */}
        <TabsContent value="persons" className="space-y-3">
          <ContactPersonsTable form={form} addButtonLabel="Add contact person" />
        </TabsContent>

        {/* ─── Bank Details ─── */}
        <TabsContent value="bank" className="space-y-3">
          <div className="grid gap-4 md:grid-cols-[1fr_18rem] items-start">
            <div className="space-y-4">
              {banks.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank accounts yet — add one below to enable Bill
                  Payments.
                </p>
              ) : null}
              {banks.fields.map((f, i) => {
                const visible = !!showAcctNos[i];
                return (
                  <div
                    key={f.id}
                    className="rounded-md border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Bank account #{i + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={() => banks.remove(i)}
                        aria-label="Remove bank account"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        placeholder="Account holder name"
                        {...form.register(
                          `bankAccounts.${i}.accountHolderName`
                        )}
                      />
                      <Input
                        placeholder="Bank name"
                        {...form.register(`bankAccounts.${i}.bankName`)}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="flex gap-2">
                        <Input
                          type={visible ? "text" : "password"}
                          placeholder="Account number *"
                          {...form.register(
                            `bankAccounts.${i}.accountNumber`
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={
                            visible
                              ? "Hide account number"
                              : "Show account number"
                          }
                          onClick={() =>
                            setShowAcctNos((s) => ({
                              ...s,
                              [i]: !s[i],
                            }))
                          }
                        >
                          {visible ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div>
                        <Input
                          type={visible ? "text" : "password"}
                          placeholder="Re-enter account number *"
                          {...form.register(
                            `bankAccounts.${i}.reEnteredAccountNumber`
                          )}
                        />
                        {form.formState.errors.bankAccounts?.[i]
                          ?.reEnteredAccountNumber ? (
                          <p className="mt-1 text-xs text-destructive">
                            {
                              form.formState.errors.bankAccounts[i]
                                ?.reEnteredAccountNumber?.message
                            }
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 items-start">
                      <div>
                        <Input
                          placeholder="IFSC *"
                          className="uppercase"
                          maxLength={11}
                          {...form.register(`bankAccounts.${i}.ifscCode`)}
                        />
                        {form.formState.errors.bankAccounts?.[i]?.ifscCode ? (
                          <p className="mt-1 text-xs text-destructive">
                            {
                              form.formState.errors.bankAccounts[i]?.ifscCode
                                ?.message
                            }
                          </p>
                        ) : null}
                      </div>
                      <Controller
                        name={`bankAccounts.${i}.isDefault`}
                        control={form.control}
                        render={({ field }) => (
                          <label className="inline-flex items-center gap-2 text-sm pt-2">
                            <input
                              type="checkbox"
                              checked={!!field.value}
                              onChange={(e) => {
                                // Single default — clear others when
                                // selecting this one.
                                if (e.target.checked) {
                                  banks.fields.forEach((_b, j) =>
                                    form.setValue(
                                      `bankAccounts.${j}.isDefault`,
                                      j === i
                                    )
                                  );
                                } else {
                                  field.onChange(false);
                                }
                              }}
                            />
                            Default for payments
                          </label>
                        )}
                      />
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => banks.append({ ...blankBank })}
              >
                <Plus className="h-4 w-4" /> Add new bank
              </Button>
            </div>
            <PartnerBankPromo />
          </div>
        </TabsContent>

        {/* ─── Custom Fields ─── */}
        <TabsContent value="custom">
          <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
            No custom fields yet — configure them in{" "}
            <a
              className="underline"
              href="/settings/preferences/customers-and-vendors"
            >
              settings → preferences
            </a>
            .
          </div>
        </TabsContent>

        {/* ─── Reporting Tags ─── */}
        <TabsContent value="tags">
          <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
            Reporting tag options will appear here once configured in{" "}
            <a className="underline" href="/settings/reporting-tags">
              settings → reporting tags
            </a>
            .
          </div>
        </TabsContent>

        {/* ─── Remarks ─── */}
        <TabsContent value="remarks">
          <div className="space-y-2">
            <Label htmlFor="notes">Remarks</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Free-form notes about this vendor."
              rows={6}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* ───── Sticky action bar ───── */}
      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button type="submit" disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (form.formState.isDirty) {
              if (!confirm("Discard your changes?")) return;
            }
            router.push(cancelHref);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
