import { Decimal } from "decimal.js";

const SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  AED: "د.إ",
  SGD: "S$",
};

export function currencySymbol(code: string) {
  return SYMBOL[code] ?? code;
}

export function toDecimal(input: string | number | null | undefined): Decimal | null {
  if (input === null || input === undefined || input === "") return null;
  try {
    return new Decimal(input);
  } catch {
    return null;
  }
}

export function formatMoney(value: unknown, currency = "INR") {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : Number(value.toString());
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currencySymbol(currency)}${n.toFixed(2)}`;
  }
}
