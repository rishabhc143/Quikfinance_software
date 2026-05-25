import { describe, it, expect } from "vitest";
import {
  buildSalesByItem,
  type InvoiceLineForSalesByItem,
} from "@/lib/reports/sales-by-item";

function line(
  itemId: string | null,
  itemName: string | null,
  description: string,
  quantity: number,
  amount: number,
  invoiceStatus: string = "PAID",
): InvoiceLineForSalesByItem {
  return {
    itemId,
    description,
    quantity,
    amount,
    item: itemId && itemName ? { id: itemId, name: itemName } : null,
    invoiceStatus,
  };
}

describe("lib/reports/sales-by-item", () => {
  it("empty input produces empty output", () => {
    const r = buildSalesByItem([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalQuantity).toBe(0);
    expect(r.totalAmount).toBe(0);
    expect(r.itemCount).toBe(0);
  });

  it("groups lines by itemId", () => {
    const r = buildSalesByItem([
      line("i1", "Widget", "Widget", 2, 1000),
      line("i1", "Widget", "Widget", 3, 1500),
      line("i2", "Gadget", "Gadget", 1, 500),
    ]);
    expect(r.rows).toHaveLength(2);
    const widget = r.rows.find((x) => x.itemName === "Widget")!;
    expect(widget.quantitySold).toBe(5);
    expect(widget.amount).toBe(2500);
  });

  it("computes average price = amount / quantity", () => {
    const r = buildSalesByItem([
      line("i1", "Widget", "Widget", 4, 2000),
    ]);
    expect(r.rows[0].averagePrice).toBe(500);
  });

  it("falls back to description when itemId is null", () => {
    const r = buildSalesByItem([
      line(null, null, "Custom one-off line", 1, 100),
      line(null, null, "Custom one-off line", 2, 200),
      line(null, null, "Different one-off", 1, 50),
    ]);
    expect(r.rows).toHaveLength(2);
    const customLine = r.rows.find((x) => x.itemName === "Custom one-off line")!;
    expect(customLine.quantitySold).toBe(3);
    expect(customLine.amount).toBe(300);
  });

  it("treats different descriptions as different items even without itemId", () => {
    const r = buildSalesByItem([
      line(null, null, "Foo", 1, 100),
      line(null, null, "Bar", 1, 200),
    ]);
    expect(r.rows).toHaveLength(2);
  });

  it("excludes DRAFT invoice lines", () => {
    const r = buildSalesByItem([
      line("i1", "Widget", "Widget", 2, 1000, "DRAFT"),
      line("i1", "Widget", "Widget", 3, 1500, "SENT"),
    ]);
    expect(r.rows[0].quantitySold).toBe(3);
    expect(r.rows[0].amount).toBe(1500);
  });

  it("excludes VOID invoice lines", () => {
    const r = buildSalesByItem([
      line("i1", "Widget", "Widget", 2, 1000, "VOID"),
      line("i1", "Widget", "Widget", 3, 1500, "PAID"),
    ]);
    expect(r.rows[0].quantitySold).toBe(3);
  });

  it("includes SENT / PARTIALLY_PAID / PAID / OVERDUE", () => {
    const r = buildSalesByItem([
      line("i1", "A", "A", 1, 100, "SENT"),
      line("i2", "B", "B", 1, 200, "PARTIALLY_PAID"),
      line("i3", "C", "C", 1, 300, "PAID"),
      line("i4", "D", "D", 1, 400, "OVERDUE"),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.totalAmount).toBe(1000);
  });

  it("sorts by amount descending", () => {
    const r = buildSalesByItem([
      line("i1", "A", "A", 1, 100),
      line("i2", "B", "B", 1, 5000),
      line("i3", "C", "C", 1, 1000),
    ]);
    expect(r.rows.map((x) => x.itemName)).toEqual(["B", "C", "A"]);
  });

  it("breaks amount ties by item name ascending", () => {
    const r = buildSalesByItem([
      line("i3", "Charlie", "C", 1, 100),
      line("i1", "Alpha", "A", 1, 100),
      line("i2", "Bravo", "B", 1, 100),
    ]);
    expect(r.rows.map((x) => x.itemName)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("aggregates total quantity + amount across items", () => {
    const r = buildSalesByItem([
      line("i1", "A", "A", 2, 1000),
      line("i2", "B", "B", 5, 2500),
      line("i3", "C", "C", 1, 200),
    ]);
    expect(r.totalQuantity).toBe(8);
    expect(r.totalAmount).toBe(3700);
  });

  it("averagePrice = 0 when quantitySold = 0 (defensive)", () => {
    const r = buildSalesByItem([
      line("i1", "A", "A", 0, 100),
    ]);
    expect(r.rows[0].averagePrice).toBe(0);
  });

  it("rounds money values to 2 decimals", () => {
    const r = buildSalesByItem([
      line("i1", "A", "A", 3, 100.005),
    ]);
    expect(r.rows[0].amount).toBe(100.01);
  });

  it("preserves item identifying fields", () => {
    const r = buildSalesByItem([
      line("item-id-1", "Acme Widget", "Acme Widget", 1, 100),
    ]);
    expect(r.rows[0].itemKey).toBe("item-id-1");
    expect(r.rows[0].itemName).toBe("Acme Widget");
  });
});
