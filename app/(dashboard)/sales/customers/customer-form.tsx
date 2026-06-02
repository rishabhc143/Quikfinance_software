"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { DatePicker } from "@/components/shared/date-picker";
import { ContactPersonsTable } from "@/components/shared/contact-persons-table";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import { GstinPrefillDialog } from "./gstin-prefill-dialog";
import { gstinErrors } from "@/lib/validators/gstin";

/**
 * Soft warning hint shown under the GSTIN field. Doesn't block save —
 * users with a known-bad GSTIN just see a red line of advice. Empty
 * input is treated as valid (the field is optional).
 */
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
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {errors[0]}
    </p>
  );
}
import { toast } from "sonner";

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

export type CustomerFormProps = {
  initial?: Partial<CustomerInput>;
  paymentTermsOptions: ComboboxOption[];
  customerOwnerOptions?: ComboboxOption[];
  defaultCurrency: string;
  /** Optional preview of what the next display name would be from the name fields. */
  onSubmitAction: (values: CustomerInput) => Promise<unknown>;
  submitLabel?: string;
  cancelHref?: string;
};

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


export function CustomerForm({
  initial,
  paymentTermsOptions,
  customerOwnerOptions = [],
  defaultCurrency,
  onSubmitAction,
  submitLabel = "Save",
  cancelHref = "/sales/customers",
}: CustomerFormProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customerType: "BUSINESS",
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
      currency: defaultCurrency,
      paymentTermsId: null,
      enablePortal: false,
      portalLanguage: null,
      customerOwnerId: null,
      openingBalance: null,
      openingBalanceAsOf: null,
      websiteUrl: "",
      facebookUrl: "",
      twitterHandle: "",
      notes: "",
      addresses: [],
      contactPersons: [],
      ...(initial ?? {}),
    },
  });

  const customerType = form.watch("customerType");
  const firstName = form.watch("firstName");
  const lastName = form.watch("lastName");
  const salutation = form.watch("salutation");
  const companyName = form.watch("companyName");

  // Auto-suggest display name combinations as the user types names.
  const displayNameSuggestions = React.useMemo(() => {
    const out = new Set<string>();
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (name) {
      out.add(name);
      if (salutation) out.add(`${salutation} ${name}`);
    }
    if (lastName && firstName) {
      out.add(`${lastName}, ${firstName}`);
    }
    if (companyName) out.add(companyName);
    return Array.from(out);
  }, [firstName, lastName, salutation, companyName]);

  const addresses = useFieldArray({ control: form.control, name: "addresses" });
  // CRIT-2 audit: `persons` field array lives inside `<ContactPersonsTable>`
  // now — caller only needs to ensure `contactPersons: []` is in defaults.

  React.useEffect(() => {
    if (addresses.fields.length === 0) {
      addresses.append({ ...blankAddress, kind: "billing", isDefault: true });
      addresses.append({ ...blankAddress, kind: "shipping" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: CustomerInput) {
    setBusy(true);
    try {
      await onSubmitAction(values);
      // server action redirects on success
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  function copyBillingToShipping() {
    const all = form.getValues("addresses") ?? [];
    const billing = all.find((a) => a.kind === "billing");
    if (!billing) return;
    const shippingIndex = all.findIndex((a) => a.kind === "shipping");
    const next = { ...billing, kind: "shipping" as const, isDefault: false };
    if (shippingIndex >= 0) addresses.update(shippingIndex, next);
    else addresses.append(next);
    toast.success("Copied billing address to shipping");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Top fixed section */}
      <section className="space-y-4 rounded-md border bg-card p-6">
        <fieldset className="flex items-center gap-6">
          <Label className="w-40">Customer Type</Label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              {...form.register("customerType")}
              value="BUSINESS"
              defaultChecked={customerType === "BUSINESS"}
            />
            Business
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" {...form.register("customerType")} value="INDIVIDUAL" />
            Individual
          </label>
        </fieldset>

        <div className="grid gap-3 md:grid-cols-[10rem_1fr] items-start">
          <Label className="pt-2">Primary Contact</Label>
          <div className="grid gap-2 md:grid-cols-3">
            <Controller
              name="salutation"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={SALUTATIONS.map((s) => ({ value: s, label: s || "—" }))}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Salutation"
                />
              )}
            />
            <HistoryInput autofillKey="contact.firstName" placeholder="First name" autoFocus {...form.register("firstName")} />
            <HistoryInput autofillKey="contact.lastName" placeholder="Last name" {...form.register("lastName")} />
          </div>

          {customerType === "BUSINESS" ? (
            <>
              <Label className="pt-2">Company Name</Label>
              <Input {...form.register("companyName")} placeholder="Company name" />
            </>
          ) : null}

          <Label className="pt-2" htmlFor="displayName">
            Display Name *
          </Label>
          <div>
            <Controller
              name="displayName"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={[
                    ...displayNameSuggestions.map((s) => ({ value: s, label: s })),
                    ...(field.value && !displayNameSuggestions.includes(field.value)
                      ? [{ value: field.value, label: field.value }]
                      : []),
                  ]}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Customer display name"
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
            Email Address
          </Label>
          <Input type="email" {...form.register("email")} placeholder="email@example.com" />

          <Label className="pt-2">Phone</Label>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex gap-2">
              <Input
                {...form.register("workPhoneCountry")}
                className="w-20"
                placeholder="+91"
              />
              <Input {...form.register("workPhone")} placeholder="Work phone" />
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

          <Label className="pt-2">Customer Language</Label>
          <Controller
            name="language"
            control={form.control}
            render={({ field }) => (
              <Combobox
                options={LANGUAGES}
                value={field.value}
                onChange={(v) => field.onChange(v ?? "en")}
              />
            )}
          />
        </div>
      </section>

      {/* Tabs */}
      <Tabs defaultValue="other" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="other">Other Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="persons">Contact Persons</TabsTrigger>
          <TabsTrigger value="custom">Custom Fields</TabsTrigger>
          <TabsTrigger value="tags">Reporting Tags</TabsTrigger>
          <TabsTrigger value="remarks">Remarks</TabsTrigger>
        </TabsList>

        <TabsContent value="other" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[10rem_1fr] items-start">
            <Label className="pt-2">PAN</Label>
            <Input
              {...form.register("pan")}
              placeholder="ABCDE1234F"
              className="uppercase"
              maxLength={10}
            />

            <Label className="pt-2">Currency</Label>
            <HistoryInput autofillKey="contact.currency" {...form.register("currency")} placeholder="INR" />

            <Label className="pt-2">Opening Balance</Label>
            <Controller
              name="openingBalance"
              control={form.control}
              render={({ field }) => (
                <MoneyInput
                  value={field.value ?? ""}
                  onChange={(v) => field.onChange(v === "" ? null : Number(v))}
                  currencyCode="INR"
                  allowNegative
                />
              )}
            />

            <Label className="pt-2">Opening as of</Label>
            <Controller
              name="openingBalanceAsOf"
              control={form.control}
              render={({ field }) => (
                <DatePicker
                  value={field.value ?? null}
                  onChange={(d) => field.onChange(d)}
                />
              )}
            />

            <Label className="pt-2">Payment Terms</Label>
            <Controller
              name="paymentTermsId"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={paymentTermsOptions}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v)}
                  placeholder="Due on Receipt"
                />
              )}
            />

            <Label className="pt-2">Tax Preference</Label>
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
              <GstinPrefillDialog
                initialGstin={form.getValues("gstin") ?? ""}
                onApply={(data) => {
                  form.setValue("gstin", data.gstin);
                  if (!form.getValues("displayName")) {
                    form.setValue("displayName", data.tradeName);
                  }
                  if (!form.getValues("companyName")) {
                    form.setValue("companyName", data.legalName);
                  }
                  form.setValue("gstTreatment", data.gstTreatment);
                  form.setValue("placeOfSupply", data.placeOfSupply);
                  // Populate the first (billing) address
                  const addresses = form.getValues("addresses") ?? [];
                  const billingIdx = addresses.findIndex(
                    (a) => a?.kind === "billing"
                  );
                  if (billingIdx >= 0) {
                    form.setValue(
                      `addresses.${billingIdx}.addressLine1`,
                      data.addressLine1
                    );
                    form.setValue(
                      `addresses.${billingIdx}.addressLine2`,
                      data.addressLine2
                    );
                    form.setValue(`addresses.${billingIdx}.city`, data.city);
                    form.setValue(`addresses.${billingIdx}.state`, data.state);
                    form.setValue(`addresses.${billingIdx}.zipCode`, data.zipCode);
                    form.setValue(
                      `addresses.${billingIdx}.country`,
                      data.country
                    );
                  }
                }}
              />
            </div>

            <Label className="pt-2">GST Treatment</Label>
            <Controller
              name="gstTreatment"
              control={form.control}
              render={({ field }) => (
                <Combobox
                  options={[
                    { value: "registered", label: "Registered Business" },
                    { value: "unregistered", label: "Unregistered Business" },
                    { value: "composition", label: "Composition Scheme" },
                    { value: "consumer", label: "Consumer" },
                    { value: "overseas", label: "Overseas" },
                  ]}
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />

            <Label className="pt-2">Place of Supply</Label>
            <HistoryInput autofillKey="address.state" {...form.register("placeOfSupply")} placeholder="State name" />

            <Label className="pt-2">Website</Label>
            <Input {...form.register("websiteUrl")} placeholder="https://" />

            <Label className="pt-2">Twitter</Label>
            <Input {...form.register("twitterHandle")} placeholder="@handle" />

            <Label className="pt-2">Facebook</Label>
            <Input {...form.register("facebookUrl")} placeholder="https://facebook.com/..." />

            <Label className="pt-2">Customer Owner</Label>
            <Controller
              name="customerOwnerId"
              control={form.control}
              render={({ field }) => (
                <div className="space-y-1">
                  <Combobox
                    options={customerOwnerOptions}
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v)}
                    placeholder="(Unassigned)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Assign a user as the customer owner to provide access only to the data of this customer.
                  </p>
                </div>
              )}
            />

            <Label className="pt-2 flex items-start gap-2">
              <span>Enable Portal?</span>
            </Label>
            <Controller
              name="enablePortal"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                  <span className="text-sm text-muted-foreground">
                    Allow portal access for this customer
                  </span>
                </div>
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="address" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["billing", "shipping"] as const).map((kind) => {
              const idx = addresses.fields.findIndex((a) => a.kind === kind);
              if (idx === -1) return null;
              return (
                <div key={kind} className="rounded-md border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize">{kind} Address</h3>
                    {kind === "shipping" ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={copyBillingToShipping}
                      >
                        Copy Billing Address
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Attention"
                    {...form.register(`addresses.${idx}.attention`)}
                  />
                  <HistoryInput
                    autofillKey="address.country"
                    placeholder="Country"
                    {...form.register(`addresses.${idx}.country`)}
                  />
                  <Input
                    placeholder="Address line 1"
                    {...form.register(`addresses.${idx}.addressLine1`)}
                  />
                  <Input
                    placeholder="Address line 2"
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
                      placeholder="ZIP"
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
        </TabsContent>

        <TabsContent value="persons" className="space-y-3">
          <ContactPersonsTable form={form} addButtonLabel="Add Contact Person" />
        </TabsContent>

        <TabsContent value="custom">
          <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
            No custom fields yet — configure them in{" "}
            <a className="underline" href="/settings/preferences/customers-and-vendors">
              settings → preferences
            </a>
            .
          </div>
        </TabsContent>

        <TabsContent value="tags">
          <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
            Reporting tag options will appear here once configured in{" "}
            <a className="underline" href="/settings/reporting-tags">
              settings → reporting tags
            </a>
            .
          </div>
        </TabsContent>

        <TabsContent value="remarks">
          <div className="space-y-2">
            <Label htmlFor="notes">Remarks</Label>
            <Textarea
              id="notes"
              {...form.register("notes")}
              placeholder="Free-form notes about this customer."
              rows={6}
            />
          </div>
        </TabsContent>
      </Tabs>

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

// Re-export schema-driven type for the page wrapper
export type { CustomerInput };
