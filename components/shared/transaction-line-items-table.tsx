"use client";

import * as React from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/shared/money-input";
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
};

export type ItemOption = ComboboxOption & {
  rate?: string;
  description?: string;
  hsnSacCode?: string;
  unit?: string;
};

export type TaxOption = ComboboxOption & { rate: number };

export type ColumnConfig = {
  showRate?: boolean; // Delivery Challan can hide rate visually
  showDiscount?: boolean;
  showTax?: boolean;
  showHsn?: boolean;
};

export type TransactionLineItemsTableProps = {
  initialLines?: LineItem[];
  itemOptions: ItemOption[];
  taxOptions?: TaxOption[];
  columnConfig?: ColumnConfig;
  onChange?: (lines: LineItem[], totals: DocumentComputed) => void;
  /** Document-level tax for live-total readout. */
  documentDiscount?: { value: string; type: "percentage" | "amount" };
  documentTax?: { rate: string; type?: "TDS" | "TCS" };
  adjustment?: string;
  className?: string;
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
    ...(props.columnConfig ?? {}),
  };
  const [lines, setLines] = React.useState<LineItem[]>(
    props.initialLines && props.initialLines.length > 0 ? props.initialLines : [newLine()]
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const taxOptions = props.taxOptions ?? [];
  const taxByValue = React.useMemo(() => new Map(taxOptions.map((t) => [t.value, t])), [taxOptions]);

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
              <th className="p-2 text-right w-24">Qty</th>
              {cfg.showRate ? <th className="p-2 text-right w-32">Rate</th> : null}
              {cfg.showDiscount ? <th className="p-2 text-right w-28">Discount</th> : null}
              {cfg.showTax ? <th className="p-2 text-left w-32">Tax</th> : null}
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
                          patch(l.id, {
                            itemId: option.value,
                            name: option.label,
                            description: option.description ?? l.description,
                            hsnSacCode: option.hsnSacCode ?? l.hsnSacCode,
                            unit: option.unit ?? l.unit,
                            rate: option.rate ?? l.rate,
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
                      <td colSpan={6} className="p-3 space-y-2">
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
      </div>

      <aside className="ml-auto max-w-sm rounded-md border bg-card p-4 text-sm">
        <dl className="space-y-1">
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
