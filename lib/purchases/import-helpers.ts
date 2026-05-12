/**
 * Pure helpers for the Purchases CSV-import wizards.
 *
 * The four wizards (bills / vendor-credits / recurring-bills /
 * recurring-expenses) share the same parsing primitives but each owns
 * its own header alias map (the canonical field names differ per
 * entity). Extracting these into a shared module:
 *
 *   - Keeps the action files focused on entity-specific DB writes
 *   - Lets vitest unit-test the parsing behavior without spinning up
 *     a DB (server actions touch Prisma and can't be invoked from
 *     pure-function tests)
 *   - Provides one place to fix date/bool quirks if needed
 */

/**
 * Build a header-normalizer function bound to a specific alias map.
 *
 * The CSV column headers users type aren't predictable — we accept
 * common spellings (e.g. "Vendor Name", "vendor", "supplier name")
 * and map them to one canonical key. Unknown headers pass through
 * untouched (truncated to 80 chars to keep keys sane).
 */
export function makeHeaderNormalizer(
  aliases: Record<string, string>
): (h: string) => string {
  return (h: string) =>
    (aliases[h.trim().toLowerCase()] ?? h.trim()).slice(0, 80);
}

/**
 * Parse a date column from CSV. Accepts:
 *   - ISO: yyyy-mm-dd
 *   - Slash: dd/mm/yyyy or dd-mm-yyyy (India default — first part is
 *     day, second is month)
 *   - Anything `new Date(str)` can swallow (RFC 2822 etc.) as a
 *     last-resort fallback.
 *
 * Returns null on empty / unparseable input — callers should treat
 * null as a per-row error and report it back to the user.
 */
export function parseImportDate(v: string | undefined): Date | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(t)) {
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const slash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const m = t.match(slash);
  if (m) {
    const [, a, b, y] = m;
    const d = new Date(Number(y), Number(b) - 1, Number(a));
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const fallback = new Date(t);
  return Number.isFinite(fallback.getTime()) ? fallback : null;
}

/**
 * Parse a boolean column. Accepts the obvious spellings, returns null
 * for empty / unknown inputs so callers can default per-field.
 *   - true:  "true", "yes", "1", "y"   (case-insensitive)
 *   - false: "false", "no", "0", "n"
 */
export function parseImportBool(v: string | undefined): boolean | null {
  if (v == null) return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (["true", "yes", "1", "y"].includes(t)) return true;
  if (["false", "no", "0", "n"].includes(t)) return false;
  return null;
}
