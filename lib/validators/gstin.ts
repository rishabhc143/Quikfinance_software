/**
 * Indian GSTIN (Goods and Services Tax Identification Number)
 * validator.
 *
 * Format (15 chars):
 *   Position 1–2 : numeric state code (01–37)
 *   Position 3–12: PAN of the entity (5 alpha + 4 numeric + 1 alpha)
 *   Position 13  : entity number (1–9, then A–Z)
 *   Position 14  : letter "Z" (constant, per the format spec)
 *   Position 15  : checksum character (alphanumeric)
 *
 * The checksum uses a documented mod-36 algorithm:
 *   chars[i] mapped to value (0–9, A=10..Z=35); multiply alternate
 *   positions by 1 and 2; sum the digits of each weighted product;
 *   take mod 36; subtract from 36; mod 36 again; map back to a char.
 *
 * Reference: <https://en.wikipedia.org/wiki/Indian_Goods_and_Services_Tax_Number>
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Returns the list of issues found; empty when the GSTIN is valid. */
export function gstinErrors(raw: string): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "string") {
    return ["GSTIN is empty"];
  }
  const s = raw.trim().toUpperCase();
  if (s.length !== 15) {
    errors.push(
      `GSTIN must be 15 characters (got ${s.length})`
    );
  }
  if (!/^[0-9A-Z]+$/.test(s)) {
    errors.push("GSTIN may only contain digits and uppercase letters");
  }
  // Only run structural / checksum checks when length + charset are OK
  if (errors.length > 0) return errors;

  const stateCode = parseInt(s.slice(0, 2), 10);
  if (!Number.isFinite(stateCode) || stateCode < 1 || stateCode > 37) {
    errors.push(
      `State code "${s.slice(0, 2)}" is not in the valid range 01–37`
    );
  }
  // PAN slice: positions 3–12 → s[2..11]
  // PAN format: 5 letters + 4 digits + 1 letter
  const pan = s.slice(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    errors.push(
      `Embedded PAN "${pan}" doesn't match the expected 5-letter / 4-digit / 1-letter pattern`
    );
  }
  // Position 14 (index 13) must be "Z"
  if (s[13] !== "Z") {
    errors.push(`Position 14 must be the letter "Z" (got "${s[13]}")`);
  }
  // Checksum
  const expected = computeChecksum(s.slice(0, 14));
  if (s[14] !== expected) {
    errors.push(
      `Checksum digit "${s[14]}" doesn't match the computed value "${expected}"`
    );
  }
  return errors;
}

export function isValidGstin(raw: string): boolean {
  return gstinErrors(raw).length === 0;
}

/**
 * Compute the 15th checksum character from the first 14 characters.
 *
 * Algorithm (verified against the well-known sample `27ABCDE1234F1Z5`):
 *   1. Map each character to its base-36 value (0–9, A=10..Z=35)
 *   2. Multiply by alternating factors — factor 2 at ODD positions
 *      (1-indexed, so index 0 is "position 1"), factor 1 at EVEN
 *   3. Sum all weighted values
 *   4. checkValue = (36 − (sum mod 36)) mod 36
 *   5. Map back to a CHARSET character
 */
export function computeChecksum(first14: string): string {
  if (first14.length !== 14) {
    throw new Error("computeChecksum expects exactly 14 characters");
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value === -1) {
      throw new Error(`Invalid character "${first14[i]}" at position ${i + 1}`);
    }
    // Factor 2 at odd 1-indexed positions (i.e. even 0-indexed),
    // factor 1 at even 1-indexed positions.
    const multiplier = i % 2 === 0 ? 2 : 1;
    sum += value * multiplier;
  }
  const checkValue = (36 - (sum % 36)) % 36;
  return CHARSET[checkValue];
}
