"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HistoryInput } from "@/components/ui/history-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ITEM_UNITS } from "@/lib/validations/item";
import { currencySymbol } from "@/lib/money";
import { toast } from "sonner";

type Options = {
  salesAccounts: ComboboxOption[];
  purchaseAccounts: ComboboxOption[];
  /** PR #335: was previously omitted from the Options type, so the
   *  Inventory Account dropdown rendered with `options={[]}` and was
   *  effectively dead UI. Now populated from the route with Asset-type
   *  accounts grouped by subType. */
  inventoryAccounts: ComboboxOption[];
  vendors: ComboboxOption[];
  /** PR #338: Zoho-parity Sales Information Tax dropdown — active
   *  taxes only, label formatted "Name (rate%)" by the API. */
  taxes: ComboboxOption[];
  inventoryEnabled: boolean;
  currency: string;
};

export type ItemFormValues = {
  name: string;
  type: "GOODS" | "SERVICE";
  unit: string | null;
  imageUrl: string | null;
  images: string[];
  sellingPrice: number | null;
  salesAccountId: string | null;
  salesDescription: string | null;
  // PR #338: Zoho-parity Sales Information fields.
  salesTaxId: string | null;
  sellingPriceInclusiveOfTax: boolean;
  costPrice: number | null;
  purchaseAccountId: string | null;
  purchaseDescription: string | null;
  preferredVendorId: string | null;
  trackInventory: boolean;
  inventoryAccountId: string | null;
  openingStock: number | null;
  openingStockRate: number | null;
  reorderPoint: number | null;
};

const blank: ItemFormValues = {
  name: "",
  type: "GOODS",
  unit: null,
  imageUrl: null,
  images: [],
  sellingPrice: null,
  salesAccountId: null,
  salesDescription: null,
  salesTaxId: null,
  sellingPriceInclusiveOfTax: false,
  costPrice: null,
  purchaseAccountId: null,
  purchaseDescription: null,
  preferredVendorId: null,
  trackInventory: false,
  inventoryAccountId: null,
  openingStock: null,
  openingStockRate: null,
  reorderPoint: null,
};

export function ItemForm({
  initial = blank,
  onSubmit,
  submitLabel = "Save",
}: {
  initial?: Partial<ItemFormValues>;
  onSubmit: (formData: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<ItemFormValues>({ ...blank, ...initial });
  const [opts, setOpts] = React.useState<Options | null>(null);
  const [unitOptions, setUnitOptions] = React.useState<ComboboxOption[]>(
    ITEM_UNITS.map((u) => ({ value: u, label: u }))
  );
  const [salesEnabled, setSalesEnabled] = React.useState(true);
  const [purchaseEnabled, setPurchaseEnabled] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof ItemFormValues, string>>>({});
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/items/options").then((r) => r.json()).then(setOpts).catch(() => setOpts(null));
  }, []);

  React.useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function set<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  }

  const onDrop = React.useCallback(
    async (files: File[]) => {
      const remaining = 5 - values.images.length;
      if (remaining <= 0) { toast.error("Maximum 5 images per item"); return; }
      const accepted = files.slice(0, remaining);
      const newUrls: string[] = [];
      for (const file of accepted) {
        if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: max 5MB`); continue; }
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        newUrls.push(dataUrl);
      }
      if (newUrls.length === 0) return;
      const next = [...values.images, ...newUrls];
      setValues((v) => ({ ...v, images: next, imageUrl: v.imageUrl ?? next[0] ?? null }));
      setDirty(true);
    },
    [values.images] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dropzone = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
    maxFiles: 5,
    multiple: true,
  });

  function removeImage(index: number) {
    setValues((v) => {
      const next = v.images.filter((_, i) => i !== index);
      return { ...v, images: next, imageUrl: next[0] ?? null };
    });
    setDirty(true);
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof ItemFormValues, string>> = {};
    if (!values.name.trim()) errs.name = "Name is required";
    if (salesEnabled) {
      if (values.sellingPrice === null || Number.isNaN(values.sellingPrice)) errs.sellingPrice = "Selling price is required";
      if (!values.salesAccountId) errs.salesAccountId = "Sales account is required";
    }
    if (purchaseEnabled) {
      if (values.costPrice === null || Number.isNaN(values.costPrice)) errs.costPrice = "Cost price is required";
      if (!values.purchaseAccountId) errs.purchaseAccountId = "Purchase account is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) {
      toast.error("Fill the required fields highlighted in red.");
      return;
    }
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v === null || v === undefined) return;
      if (k === "images" && Array.isArray(v)) {
        fd.set("images", JSON.stringify(v));
        return;
      }
      if (typeof v === "boolean") fd.set(k, v ? "on" : "");
      else fd.set(k, String(v));
    });
    setDirty(false);
    setBusy(true);
    try {
      await onSubmit(fd);
      toast.success("Item saved");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
      setBusy(false);
    }
  }

  function cancel() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    router.push("/items");
  }

  const cur = opts?.currency ?? "INR";
  const sym = currencySymbol(cur);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Do you want to keep track of this item? Enable Inventory to view its stock based on the sales and purchase
          transactions you record for it. Go to{" "}
          <a href="/settings/preferences/items" className="underline font-medium">Settings &gt; Preferences &gt; Items</a>{" "}
          and enable inventory.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <div>
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <HistoryInput
              autofillKey="item.name"
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={200}
              required
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label>Type <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-4 mt-1.5">
              {(["GOODS", "SERVICE"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={values.type === t}
                    onChange={() => set("type", t)}
                    className="h-4 w-4"
                  />
                  {t === "GOODS" ? "Goods" : "Service"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Unit</Label>
            <Combobox
              options={unitOptions}
              value={values.unit}
              onChange={(v) => set("unit", v)}
              placeholder="Select or type…"
              allowCreate
              onCreate={(input) => {
                setUnitOptions((cur) => [...cur, { value: input, label: input }]);
                set("unit", input);
              }}
            />
          </div>
        </div>

        <div>
          <Label>Images <span className="text-muted-foreground text-xs">({values.images.length}/5)</span></Label>
          <div
            {...dropzone.getRootProps()}
            className="mt-1.5 border-2 border-dashed rounded-md p-3 text-center text-xs text-muted-foreground hover:bg-muted/30 cursor-pointer"
          >
            <input {...dropzone.getInputProps()} />
            {values.images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {values.images.map((src, i) => (
                  <div key={i} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Item image ${i + 1}`} className="w-full h-full object-cover rounded" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                      className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      aria-label={`Remove image ${i + 1}`}
                    ><X className="h-3 w-3" /></button>
                    {i === 0 && <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">Primary</span>}
                  </div>
                ))}
                {values.images.length < 5 && (
                  <div className="aspect-square border-2 border-dashed rounded grid place-items-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6 opacity-50" />
                  </div>
                )}
              </div>
            ) : (
              <>
                <ImageIcon className="h-8 w-8 mx-auto opacity-50 mb-2" />
                <div>Drag &amp; drop, or <span className="underline">browse images</span></div>
                <div className="mt-1 text-[10px]">Up to 5 images, 5MB each · png, jpg, webp, gif</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sales section */}
      <fieldset className="rounded-md border bg-background">
        <legend className="px-2 ml-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={salesEnabled} onChange={(e) => setSalesEnabled(e.target.checked)} className="h-4 w-4" />
            Sales Information
          </label>
        </legend>
        {salesEnabled && (
          <div className="p-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="sellingPrice">Selling Price <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{sym}</span>
                <Input
                  id="sellingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-8"
                  value={values.sellingPrice ?? ""}
                  onChange={(e) => set("sellingPrice", e.target.value === "" ? null : Number(e.target.value))}
                  aria-invalid={!!errors.sellingPrice}
                />
              </div>
              {/* PR #338: Zoho-parity "Selling Price (incl. tax)" toggle.
                  When ON, the price entered above is treated as
                  tax-inclusive at invoice time (the tax portion gets
                  backed out). Persisted on the item; consumed by the
                  invoice line-item logic when this item is added. */}
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={values.sellingPriceInclusiveOfTax}
                  onChange={(e) => set("sellingPriceInclusiveOfTax", e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Selling Price is inclusive of tax
              </label>
              {errors.sellingPrice && <p className="text-xs text-destructive mt-1">{errors.sellingPrice}</p>}
            </div>
            <div>
              <Label>Account <span className="text-destructive">*</span></Label>
              <Combobox
                options={opts?.salesAccounts ?? []}
                value={values.salesAccountId}
                onChange={(v) => set("salesAccountId", v)}
                placeholder="Select sales account"
              />
              {errors.salesAccountId && <p className="text-xs text-destructive mt-1">{errors.salesAccountId}</p>}
            </div>
            <div>
              {/* PR #338: Default Tax for this item. Auto-picked on the
                  invoice line when this item is selected. Optional —
                  user can override per-invoice. */}
              <Label>Tax</Label>
              <Combobox
                options={opts?.taxes ?? []}
                value={values.salesTaxId}
                onChange={(v) => set("salesTaxId", v)}
                placeholder="Select default tax"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="salesDescription">Description</Label>
              <Textarea
                id="salesDescription"
                value={values.salesDescription ?? ""}
                onChange={(e) => set("salesDescription", e.target.value || null)}
                rows={3}
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* Purchase section */}
      <fieldset className="rounded-md border bg-background">
        <legend className="px-2 ml-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={purchaseEnabled} onChange={(e) => setPurchaseEnabled(e.target.checked)} className="h-4 w-4" />
            Purchase Information
          </label>
        </legend>
        {purchaseEnabled && (
          <div className="p-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="costPrice">Cost Price <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{sym}</span>
                <Input
                  id="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-8"
                  value={values.costPrice ?? ""}
                  onChange={(e) => set("costPrice", e.target.value === "" ? null : Number(e.target.value))}
                  aria-invalid={!!errors.costPrice}
                />
              </div>
              {errors.costPrice && <p className="text-xs text-destructive mt-1">{errors.costPrice}</p>}
            </div>
            <div>
              <Label>Account <span className="text-destructive">*</span></Label>
              <Combobox
                options={opts?.purchaseAccounts ?? []}
                value={values.purchaseAccountId}
                onChange={(v) => set("purchaseAccountId", v)}
                placeholder="Select purchase account"
              />
              {errors.purchaseAccountId && <p className="text-xs text-destructive mt-1">{errors.purchaseAccountId}</p>}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="purchaseDescription">Description</Label>
              <Textarea
                id="purchaseDescription"
                value={values.purchaseDescription ?? ""}
                onChange={(e) => set("purchaseDescription", e.target.value || null)}
                rows={3}
              />
            </div>
            {/* Preferred Vendor field removed — Zoho Books Items doesn't expose
                this field on the item form. The DB column `preferredVendorId`
                + Item.preferredVendor relation are kept intact so any items
                that already have a value continue to work; new items will
                simply have it as null. The vendors query on
                /api/items/options also stays (some callers may still use it
                in the future). If you want the DB column removed too, that's
                a separate cleanup PR. */}
          </div>
        )}
      </fieldset>

      {/* Inventory section (only if org-level inventory enabled) */}
      {opts?.inventoryEnabled && (
        <fieldset className="rounded-md border bg-background">
          <legend className="px-2 ml-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={values.trackInventory}
                onChange={(e) => set("trackInventory", e.target.checked)}
                className="h-4 w-4"
              />
              Inventory Information
            </label>
          </legend>
          {values.trackInventory && (
            <div className="p-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Inventory Account</Label>
                <Combobox
                  options={opts?.inventoryAccounts ?? []}
                  value={values.inventoryAccountId}
                  onChange={(v) => set("inventoryAccountId", v)}
                  placeholder="Select inventory account"
                />
              </div>
              <div>
                <Label htmlFor="openingStock">Opening Stock</Label>
                <Input
                  id="openingStock"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.openingStock ?? ""}
                  onChange={(e) => set("openingStock", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="openingStockRate">Opening Stock Rate per Unit</Label>
                <Input
                  id="openingStockRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.openingStockRate ?? ""}
                  onChange={(e) => set("openingStockRate", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.reorderPoint ?? ""}
                  onChange={(e) => set("reorderPoint", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex items-center gap-2 justify-end pt-2 border-t">
        <Button type="button" variant="outline" onClick={cancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
