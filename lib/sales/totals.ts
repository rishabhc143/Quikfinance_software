import { Decimal } from "decimal.js";

/**
 * Pure totals computation. Server-only; never trust client-side math.
 * All inputs are coerced to Decimal for safe arithmetic; outputs are strings
 * with 4 decimal places matching the Decimal(18,4) DB column.
 */

export type LineInput = {
  quantity: number | string | Decimal;
  rate: number | string | Decimal;
  discount?: number | string | Decimal; // percentage or amount
  discountType?: "percentage" | "amount";
  taxRate?: number | string | Decimal; // percentage; line-level tax
};

export type LineComputed = {
  // Pre-tax, post-discount per-line amount
  amount: string;
  taxAmount: string;
  amountWithTax: string;
};

export type DocumentInput = {
  lines: LineInput[];
  documentDiscount?: { value: number | string | Decimal; type: "percentage" | "amount" };
  documentTax?: { rate: number | string | Decimal; type?: "TDS" | "TCS" };
  adjustment?: number | string | Decimal; // signed
};

export type DocumentComputed = {
  lines: LineComputed[];
  subTotal: string;
  documentDiscountAmount: string;
  documentTaxAmount: string;
  adjustmentAmount: string;
  total: string;
};

const D = (v: number | string | Decimal | undefined | null): Decimal => {
  if (v == null) return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(v.toString());
};

const fmt = (d: Decimal): string => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);

export function computeLine(line: LineInput): LineComputed {
  const qty = D(line.quantity);
  const rate = D(line.rate);
  let gross = qty.mul(rate);
  const disc = D(line.discount);
  if (line.discountType === "amount") {
    gross = Decimal.max(gross.minus(disc), 0);
  } else if (disc.gt(0)) {
    const pct = Decimal.min(disc, 100).div(100);
    gross = gross.minus(gross.mul(pct));
  }
  const taxRate = D(line.taxRate);
  const taxAmount = taxRate.gt(0) ? gross.mul(taxRate.div(100)) : new Decimal(0);
  return {
    amount: fmt(gross),
    taxAmount: fmt(taxAmount),
    amountWithTax: fmt(gross.plus(taxAmount)),
  };
}

export function computeDocument(input: DocumentInput): DocumentComputed {
  const lines = input.lines.map(computeLine);
  const subTotal = lines.reduce((acc, l) => acc.plus(D(l.amount)), new Decimal(0));
  const lineTaxTotal = lines.reduce((acc, l) => acc.plus(D(l.taxAmount)), new Decimal(0));

  let documentDiscountAmount = new Decimal(0);
  if (input.documentDiscount) {
    if (input.documentDiscount.type === "amount") {
      documentDiscountAmount = D(input.documentDiscount.value);
    } else {
      const pct = Decimal.min(D(input.documentDiscount.value), 100).div(100);
      documentDiscountAmount = subTotal.mul(pct);
    }
  }

  const taxableBase = subTotal.minus(documentDiscountAmount);
  let documentTaxAmount = new Decimal(0);
  if (input.documentTax && D(input.documentTax.rate).gt(0)) {
    documentTaxAmount = taxableBase.mul(D(input.documentTax.rate).div(100));
    // TDS subtracts (deducted at source); TCS adds (collected at source).
    if (input.documentTax.type === "TDS") {
      documentTaxAmount = documentTaxAmount.neg();
    }
  }

  const adjustmentAmount = D(input.adjustment);

  const total = taxableBase.plus(lineTaxTotal).plus(documentTaxAmount).plus(adjustmentAmount);

  return {
    lines,
    subTotal: fmt(subTotal),
    documentDiscountAmount: fmt(documentDiscountAmount),
    documentTaxAmount: fmt(documentTaxAmount),
    adjustmentAmount: fmt(adjustmentAmount),
    total: fmt(total),
  };
}
