/**
 * Indian Rupee → words converter.
 *
 * Outputs the canonical Indian numbering used on tax invoices,
 * e.g. ₹2,47,800.00 → "Indian Rupee Two Lakh Forty-Seven Thousand
 * Eight Hundred Only". Used by the invoice PDF renderer (matches
 * the reference "Total In Words" line on the user-shared PDF).
 *
 * Supports up to 9999 crore (~999 billion). Above that, returns
 * the numeric string in words clamped to crores.
 */

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
}

function threeDigit(n: number): string {
  if (n === 0) return "";
  if (n < 100) return twoDigit(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const left = `${ONES[h]} Hundred`;
  return rest === 0 ? left : `${left} ${twoDigit(rest)}`;
}

/**
 * Convert a non-negative integer to Indian-style words
 * (Crore / Lakh / Thousand / Hundred). Returns words only, no
 * "Rupee" prefix.
 */
export function intToIndianWords(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "Zero";
  let num = Math.floor(Math.abs(n));
  const parts: string[] = [];

  const crore = Math.floor(num / 10_000_000);
  num = num % 10_000_000;
  const lakh = Math.floor(num / 100_000);
  num = num % 100_000;
  const thousand = Math.floor(num / 1000);
  num = num % 1000;
  const rest = num; // 0..999

  if (crore > 0) parts.push(`${threeDigit(crore)} Crore`);
  if (lakh > 0) parts.push(`${threeDigit(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${threeDigit(thousand)} Thousand`);
  if (rest > 0) parts.push(threeDigit(rest));

  return parts.join(" ");
}

/**
 * Convert a Rupee amount to the full "Indian Rupee … Only"
 * sentence. Handles paise as ".XX" → "and XX paise".
 *
 * Examples:
 *   formatTotalInWords(247800)       → "Indian Rupee Two Lakh Forty-Seven Thousand Eight Hundred Only"
 *   formatTotalInWords(1234.56)      → "Indian Rupee One Thousand Two Hundred Thirty-Four and Fifty-Six Paise Only"
 *   formatTotalInWords(0)            → "Indian Rupee Zero Only"
 *   formatTotalInWords(-247800)      → "Negative Indian Rupee Two Lakh Forty-Seven Thousand Eight Hundred Only"
 */
export function formatTotalInWords(amount: number | string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) return "";
  const negative = num < 0;
  const abs = Math.abs(num);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const rupeeWords = intToIndianWords(rupees);
  let result = `Indian Rupee ${rupeeWords}`;
  if (paise > 0) {
    result += ` and ${twoDigit(paise)} Paise`;
  }
  result += " Only";
  if (negative) result = `Negative ${result}`;
  return result;
}
