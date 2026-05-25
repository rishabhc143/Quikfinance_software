/**
 * RPT-SBI — Sales by Item helper.
 *
 * Aggregates InvoiceLineItem rows by item for a date range. Columns
 * match Zoho Books' Sales by Item report per docs/zoho-reports.yaml:
 *   - Item Name
 *   - Quantity Sold
 *   - Amount       (sum of line `amount` = qty * rate)
 *   - Average Price (Amount / Quantity Sold)
 *
 * Skips lines from DRAFT / VOID invoices (those aren't real sales).
 * Line items without a linked Item fall back to the line's
 * `description` so ad-hoc entries still appear.
 *
 * Pure function — caller queries the DB and passes raw line rows.
 */

export interface InvoiceLineForSalesByItem {
  itemId: string | null;
  description: string;
  quantity: number;
  amount: number;
  item: {
    id: string;
    name: string;
  } | null;
  invoiceStatus: string;
}

export interface SalesByItemRow {
  [key: string]: unknown;
  /** Stable key — uses item.id when present, falls back to "desc:<text>". */
  itemKey: string;
  itemName: string;
  quantitySold: number;
  amount: number;
  averagePrice: number;
}

export interface SalesByItemSummary {
  rows: SalesByItemRow[];
  totalQuantity: number;
  totalAmount: number;
  itemCount: number;
}

/**
 * Build the Sales by Item view.
 *
 * Excludes DRAFT / VOID invoices. Items aggregate by `item.id` when the
 * line is linked to a catalog item; otherwise by `description` so
 * one-off ad-hoc lines don't collide with each other.
 *
 * Rows sorted by amount descending; ties by item name asc.
 */
export function buildSalesByItem(
  lines: InvoiceLineForSalesByItem[],
): SalesByItemSummary {
  const byItem = new Map<string, SalesByItemRow>();

  for (const line of lines) {
    if (line.invoiceStatus === "DRAFT" || line.invoiceStatus === "VOID") {
      continue;
    }

    const key = line.item?.id ?? `desc:${line.description}`;
    const name = line.item?.name ?? line.description ?? "Untitled Item";
    const qty = round(line.quantity);
    const amt = round(line.amount);

    const existing = byItem.get(key);
    if (existing) {
      existing.quantitySold = round(existing.quantitySold + qty);
      existing.amount = round(existing.amount + amt);
    } else {
      byItem.set(key, {
        itemKey: key,
        itemName: name,
        quantitySold: qty,
        amount: amt,
        averagePrice: 0, // filled in below
      });
    }
  }

  // Compute averagePrice per item now that quantity + amount totals settled.
  for (const row of byItem.values()) {
    row.averagePrice = row.quantitySold > 0 ? round(row.amount / row.quantitySold) : 0;
  }

  const rows = Array.from(byItem.values()).sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.itemName.localeCompare(b.itemName);
  });

  const totalQuantity = round(rows.reduce((s, r) => s + r.quantitySold, 0));
  const totalAmount = round(rows.reduce((s, r) => s + r.amount, 0));

  return {
    rows,
    totalQuantity,
    totalAmount,
    itemCount: rows.length,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
