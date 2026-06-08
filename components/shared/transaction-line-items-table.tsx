"use client";

import * as React from "react";
import { Plus, Trash2, GripVertical, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/shared/money-input";
import { ScanItemDialog } from "@/components/shared/scan-item-dialog";
import { computeDocument, type DocumentComputed } from "@/lib/sales/totals";
import { cn } from "@/lib/utils";

/**
 * Shared line-items table for Quote / Sales Order / Invoice / Delivery
 * Challan / Credit Note. Different document types pass column config plus a
 * list of selectable items and taxes. Per-row computation lives in
 * `computeDocument` (server-shared) so client + server math match.
 *
 * The component is uncontrolled-with-export: it owns the line-state and
 * surfaces it via `onChange` so the parent form can serialize it.
 */

export type LineItem = {
  id: string;
  itemId?: string | null;
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: string;
  unit?: string;
  rate: string;
  discount?: string;
  discountType?: "percentage" | "amount";
  taxId?: string | null;
  // P1 (Purchases): per-line Input Tax Credit eligibility on a Bill
  // line. Defaults to eligible (undefined treated as true).
  itcEligible?: boolean;
  // P1 (Purchases): inline account override per line. Reads from the
  // selected item's purchaseAccountId or salesAccountId by default.
  accountId?: string | null;
  // P1 (Purchases): when set on a Bill/Expense line, marks this line
  // as billable to the named customer. Surfaces on the next invoice
  // for that customer via <BillableExpensesPanel>.
  billableToCustomerId?: string | null;
};

export type AccountOption = ComboboxOption;
export type CustomerOption = ComboboxOption;

export type ItemOption = ComboboxOption & {
  rate?: string;
  description?: string;
  hsnSacCode?: string;
  unit?: string;
  /**
   * PR #339 — Sales Information item fields (added in PR #338) plumbed
   * through so item selection auto-populates the line's tax + handles
   * inclusive-of-tax conversion:
   *
   *   * `salesTaxId` — when set, the selected line's `taxId` defaults
   *     to this. User can still override per line.
   *   * `sellingPriceInclusiveOfTax` — when true (AND `salesTaxRate`
   *     is known), the displayed `rate` is treated as tax-inclusive:
   *     the handler converts it to the exclusive rate at selection
   *     time via `rate / (1 + salesTaxRate/100)` so downstream math
   *     (which assumes exclusive) stays correct.
   *   * `salesTaxRate` — the rate of the linked sales tax (e.g. 18 for
   *     18% GST). Required for the inclusive→exclusive conversion.
   */
  salesTaxId?: string | null;
  sellingPriceInclusiveOfTax?: boolean;
  salesTaxRate?: number | null;
};

export type TaxOption = ComboboxOption & {
  rate: number;
  /**
   * Optional tax category. When provided, lets consumers filter
   * the tax list by purpose:
   *   - "standard" (default) — line-item GST / VAT
   *   - "TDS" — Tax Deducted at Source (subtracts from invoice total)
   *   - "TCS" — Tax Collected at Source (adds to invoice total)
   */
  type?: string;
};

export type ColumnConfig = {
  showRate?: boolean; // Delivery Challan can hide rate visually
  showDiscount?: boolean;
  showTax?: boolean;
  showHsn?: boolean;
  /**
   * P1 (Purchases): account column.
   * - `inline`     — renders an extra cell with a combobox per row
   * - `expandable` — placeholder for future expand-row pattern
   *                  (treated as `hidden` until that lands)
   * - `hidden`     — no column (default; sales-side behavior)
   * Purchase Order and Bill use `inline`.
   */
  accountColumnVisible?: "inline" | "expandable" | "hidden";
  /**
   * P1 (Purchases): "Customer Details" column.
   * When true, renders a per-row customer combobox that marks the
   * line as a billable expense.
   * Bill, Recurring Bill, Expense pass true.
   */
  customerColumnVisible?: boolean;
  /**
   * P1 (Purchases): when true, renders a small "Eligible for ITC"
   * checkbox beneath each line's tax cell (Input Tax Credit). Bill
   * passes true; sales-side documents leave it off.
   */
  itcToggleVisible?: boolean;
};

export type TransactionLineItemsTableProps = {
  initialLines?: LineItem[];
  itemOptions: ItemOption[];
  taxOptions?: TaxOption[];
  /** P1 (Purchases): account options for the inline column. */
  accountOptions?: AccountOption[];
  /** P1 (Purchases): customer options for the per-line billable picker. */
  customerOptions?: CustomerOption[];
  columnConfig?: ColumnConfig;
  onChange?: (lines: LineItem[], totals: DocumentComputed) => void;
  /** Document-level tax for live-total readout. */
  documentDiscount?: { value: string; type: "percentage" | "amount" };
  documentTax?: { rate: string; type?: "TDS" | "TCS" };
  adjustment?: string;
  className?: string;
  /**
   * M17e: when supplied, renders a "Scan Item" button next to "Add new
   * row" / "Add Items in Bulk". The action takes a SKU and returns the
   * resolved Item (or null). The table appends the resolved row to the
   * current lines (mirroring Bulk Add's append-or-replace-blank rule).
   */
  scanItemAction?: (input: { sku: string }) => Promise<{
    id: string;
    name: string;
    sku: string | null;
    rate: string;
    description: string | null;
    unit: string | null;
  } | null>;
};

let UID = 0;
const newLine = (): LineItem => ({
  id: `line-${++UID}-${Date.now()}`,
  name: "",
  quantity: "1.00",
  rate: "0.00",
});

export function TransactionLineItemsTable(props: TransactionLineItemsTableProps) {
  const cfg: ColumnConfig = {
    showRate: true,
    showDiscount: true,
    showTax: true,
    showHsn: true,
    accountColumnVisible: "hidden",
    customerColumnVisible: false,
    ...(props.columnConfig ?? {}),
  };
  const accountColInline = cfg.accountColumnVisible === "inline";
  const customerCol = !!cfg.customerColumnVisible;
  const [lines, setLines] = React.useState<LineItem[]>(
    props.initialLines && props.initialLines.length > 0 ? props.initialLines : [newLine()]
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  // Memoise the empty-fallback so taxOptions is referentially stable
  // when props.taxOptions is undefined — fixes the react-hooks/
  // exhaustive-deps warning on the useMemo below that depends on it.
  const taxOptions = React.useMemo(
    () => props.taxOptions ?? [],
    [props.taxOptions]
  );
  const taxByValue = React.useMemo(
    () => new Map(taxOptions.map((t) => [t.value, t])),
    [taxOptions]
  );

  const totalQuantity = React.useMemo(
    () =>
      lines.reduce((n, l) => n + Number(l.quantity || 0), 0).toLocaleString(),
    [lines]
  );

  const totals = React.useMemo(() => {
    return computeDocument({
      lines: lines.map((l) => ({
        quantity: l.quantity || "0",
        rate: l.rate || "0",
        discount: l.discount || "0",
        discountType: l.discountType ?? "percentage",
        taxRate: l.taxId ? taxByValue.get(l.taxId)?.rate ?? 0 : 0,
      })),
      documentDiscount: props.documentDiscount
        ? { value: props.documentDiscount.value || "0", type: props.documentDiscount.type }
        : undefined,
      documentTax: props.documentTax
        ? { rate: props.documentTax.rate || "0", type: props.documentTax.type }
        : undefined,
      adjustment: props.adjustment || "0",
    });
  }, [lines, props.documentDiscount, props.documentTax, props.adjustment, taxByValue]);

  // Surface state changes upward so the parent form can serialize lines
  React.useEffect(() => {
    props.onChange?.(lines, totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, totals]);

  function patch(id: string, patch: Partial<LineItem>) {
    setLines((curr) => curr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function remove(id: string) {
    setLines((curr) => (curr.length === 1 ? [newLine()] : curr.filter((l) => l.id !== id)));
  }

  function add() {
    setLines((curr) => [...curr, newLine()]);
  }

  return (
    <div className={cn("space-y-3", props.className)}>
      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-8 p-2"></th>
              <th className="p-2 text-left">Item details</th>
              {accountColInline ? <th className="p-2 text-left w-40">Account</th> : null}
              <th className="p-2 text-right w-24">Qty</th>
              {cfg.showRate ? <th className="p-2 text-right w-32">Rate</th> : null}
              {cfg.showDiscount ? <th className="p-2 text-right w-28">Discount</th> : null}
              {cfg.showTax ? <th className="p-2 text-left w-32">Tax</th> : null}
              {customerCol ? <th className="p-2 text-left w-40">Customer details</th> : null}
              <th className="p-2 text-right w-32">Amount</th>
              <th className="w-8 p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, idx) => {
              const isExpanded = expanded[l.id] ?? false;
              const lineComputed = totals.lines[idx];
              return (
                <React.Fragment key={l.id}>
                  <tr>
                    <td className="p-2 align-top">
                      <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </td>
                    <td className="p-2 align-top">
                      <Combobox
                        options={props.itemOptions}
                        value={l.itemId ?? null}
                        onChange={(value) => {
                          if (value === null) {
                            patch(l.id, { itemId: null });
                            return;
                          }
                          const option = props.itemOptions.find((o) => o.value === value);
                          if (!option) {
                            patch(l.id, { itemId: value });
                            return;
                          }
                          // PR #339 — when item has sellingPriceInclusiveOfTax + a
                          // known salesTaxRate, convert the inclusive rate to the
                          // exclusive rate the rest of the math assumes. Falls back
                          // to the raw rate when either flag is off / rate unknown.
                          const rawRate = option.rate ?? l.rate;
                          const effectiveRate = (() => {
                            if (
                              !option.sellingPriceInclusiveOfTax ||
                              !option.salesTaxRate ||
                              !rawRate
                            ) {
                              return rawRate;
                            }
                            const n = Number(rawRate);
                            if (!Number.isFinite(n)) return rawRate;
                            const exclusive = n / (1 + option.salesTaxRate / 100);
                            // 2 dp matches the MoneyInput grid; tweak if a
                            // finer currency precision is ever required.
                            return exclusive.toFixed(2);
                          })();
                          patch(l.id, {
                            itemId: option.value,
                            name: option.label,
                            description: option.description ?? l.description,
                            hsnSacCode: option.hsnSacCode ?? l.hsnSacCode,
                            unit: option.unit ?? l.unit,
                            rate: effectiveRate,
                            // PR #339 — auto-populate tax from the item's default
                            // (item.salesTaxId). Only overrides when the user
                            // hasn't manually picked a tax for this line yet.
                            taxId: l.taxId ?? option.salesTaxId ?? null,
                          });
                        }}
                        placeholder="Type or click to select an item."
                      />
                      {!l.itemId ? (
                        <Input
                          className="mt-2"
                          value={l.name}
                          onChange={(e) => patch(l.id, { name: e.target.value })}
                          placeholder="Custom item name"
                          data-testid={`line-item-name-${idx}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [l.id]: !isExpanded }))}
                        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? "Hide details" : "Description, HSN/SAC…"}
                      </button>
                    </td>
                    {accountColInline ? (
                      <td className="p-2 align-top">
                        <Combobox
                          options={props.accountOptions ?? []}
                          value={l.accountId ?? null}
                          onChange={(v) => patch(l.id, { accountId: v })}
                          placeholder="Select account"
                        />
                      </td>
                    ) : null}
                    <td className="p-2 align-top">
                      <Input
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => patch(l.id, { quantity: e.target.value })}
                        className="text-right"
                      />
                    </td>
                    {cfg.showRate ? (
                      <td className="p-2 align-top">
                        <MoneyInput
                          value={l.rate}
                          onChange={(v) => patch(l.id, { rate: v })}
                          data-testid={`line-item-rate-${idx}`}
                        />
                      </td>
                    ) : null}
                    {cfg.showDiscount ? (
                      <td className="p-2 align-top">
                        <Input
                          inputMode="decimal"
                          value={l.discount ?? ""}
                          onChange={(e) => patch(l.id, { discount: e.target.value })}
                          className="text-right"
                          placeholder="0"
                        />
                      </td>
                    ) : null}
                    {cfg.showTax ? (
                      <td className="p-2 align-top">
                        <Combobox
                          options={taxOptions}
                          value={l.taxId ?? null}
                          onChange={(v) => patch(l.id, { taxId: v })}
                          placeholder="Select…"
                        />
                        {cfg.itcToggleVisible ? (
                          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={l.itcEligible ?? true}
                              onChange={(e) =>
                                patch(l.id, { itcEligible: e.target.checked })
                              }
                            />
                            Eligible for ITC
                          </label>
                        ) : null}
                      </td>
                    ) : null}
                    {customerCol ? (
                      <td className="p-2 align-top">
                        <Combobox
                          options={props.customerOptions ?? []}
                          value={l.billableToCustomerId ?? null}
                          onChange={(v) =>
                            patch(l.id, { billableToCustomerId: v })
                          }
                          placeholder="Non-billable"
                        />
                      </td>
                    ) : null}
                    <td className="p-2 align-top text-right tabular-nums">
                      {lineComputed?.amount ?? "0.0000"}
                    </td>
                    <td className="p-2 align-top">
                      <button
                        type="button"
                        onClick={() => remove(l.id)}
                        aria-label="Remove line"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="bg-muted/20">
                      <td></td>
                      <td
                        colSpan={
                          6 + (accountColInline ? 1 : 0) + (customerCol ? 1 : 0)
                        }
                        className="p-3 space-y-2"
                      >
                        <div className="grid gap-2 md:grid-cols-2">
                          {cfg.showHsn ? (
                            <Input
                              value={l.hsnSacCode ?? ""}
                              onChange={(e) => patch(l.id, { hsnSacCode: e.target.value })}
                              placeholder="HSN / SAC"
                            />
                          ) : null}
                          <Input
                            value={l.unit ?? ""}
                            onChange={(e) => patch(l.id, { unit: e.target.value })}
                            placeholder="Unit (pcs, hr, …)"
                          />
                        </div>
                        <Textarea
                          value={l.description ?? ""}
                          onChange={(e) => patch(l.id, { description: e.target.value })}
                          placeholder="Description"
                          rows={2}
                        />
                      </td>
                      <td></td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1">
          <Plus className="h-4 w-4" /> Add new row
        </Button>
        <BulkAddDialog
          itemOptions={props.itemOptions}
          onAdd={(rows) => {
            const newRows = rows.map((r) => ({
              id: `bulk-${++UID}-${Date.now()}`,
              itemId: r.itemId,
              name: r.name,
              description: r.description,
              hsnSacCode: r.hsnSacCode,
              quantity: r.quantity,
              unit: r.unit,
              rate: r.rate,
            }));
            // Replace any blank rows or append
            setLines((curr) => {
              const filtered = curr.filter((c) => c.name.trim().length > 0);
              return [...filtered, ...newRows];
            });
          }}
        />
        {props.scanItemAction ? (
          <ScanItemDialog
            onResolve={props.scanItemAction}
            onAdd={(item) => {
              const row: LineItem = {
                id: `scan-${++UID}-${Date.now()}`,
                itemId: item.id,
                name: item.name,
                description: item.description ?? "",
                hsnSacCode: "",
                quantity: "1.00",
                unit: item.unit ?? "",
                rate: item.rate,
              };
              setLines((curr) => {
                const filtered = curr.filter((c) => c.name.trim().length > 0);
                return [...filtered, row];
              });
            }}
          />
        ) : null}
      </div>

      <aside className="ml-auto max-w-sm rounded-md border bg-card p-4 text-sm">
        <dl className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>Total Quantity</dt>
            <dd className="tabular-nums">{totalQuantity}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sub Total</dt>
            <dd className="tabular-nums">{totals.subTotal}</dd>
          </div>
          {props.documentDiscount ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">-{totals.documentDiscountAmount}</dd>
            </div>
          ) : null}
          {props.documentTax ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{props.documentTax.type ?? "Tax"}</dt>
              <dd className="tabular-nums">{totals.documentTaxAmount}</dd>
            </div>
          ) : null}
          {props.adjustment ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Adjustment</dt>
              <dd className="tabular-nums">{totals.adjustmentAmount}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{totals.total}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

/**
 * Modal that lets a merchant pick multiple items from the catalog with a
 * per-item quantity. Per <quotes_spec> "Add Items in Bulk button — opens
 * modal with searchable item list, multi-select with quantity column,
 * bulk add". Calls back with one row per selected item.
 */
function BulkAddDialog({
  itemOptions,
  onAdd,
}: {
  itemOptions: ItemOption[];
  onAdd: (
    rows: {
      itemId: string;
      name: string;
      description?: string;
      hsnSacCode?: string;
      quantity: string;
      unit?: string;
      rate: string;
    }[]
  ) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selections, setSelections] = React.useState<Record<string, string>>({});

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return itemOptions;
    return itemOptions.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.hint?.toLowerCase().includes(q)
    );
  }, [search, itemOptions]);

  function commit() {
    const rows = Object.entries(selections)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([itemId, qty]) => {
        const opt = itemOptions.find((o) => o.value === itemId)!;
        return {
          itemId,
          name: opt.label,
          description: opt.description,
          hsnSacCode: opt.hsnSacCode,
          quantity: qty,
          unit: opt.unit,
          rate: opt.rate ?? "0",
        };
      });
    onAdd(rows);
    setSelections({});
    setSearch("");
    setOpen(false);
  }

  const totalSelected = Object.values(selections).reduce(
    (n, v) => n + (Number(v) > 0 ? 1 : 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <Layers className="h-4 w-4" /> Add Items in Bulk
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add items in bulk</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items"
          />
          <div className="max-h-80 overflow-y-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right w-24">Rate</th>
                  <th className="p-2 text-right w-28">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((opt) => (
                  <tr key={opt.value}>
                    <td className="p-2">
                      <div className="font-medium">{opt.label}</div>
                      {opt.hint ? (
                        <div className="text-xs text-muted-foreground">
                          {opt.hint}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {opt.rate ?? "0"}
                    </td>
                    <td className="p-2">
                      <Input
                        inputMode="decimal"
                        className="h-8 text-right"
                        value={selections[opt.value] ?? ""}
                        onChange={(e) =>
                          setSelections({
                            ...selections,
                            [opt.value]: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-3 text-center text-sm text-muted-foreground"
                    >
                      No items match.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {totalSelected} item(s) selected
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={totalSelected === 0}>
            Add {totalSelected || ""} item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
