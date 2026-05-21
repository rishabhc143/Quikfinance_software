/**
 * DOC-D2.1: PDF text extraction via `pdf-parse` (Apache-2.0, ~50KB).
 *
 * Server-side only. Called from `uploadDocumentsAction` after the
 * file lands on Vercel Blob. Fail-open — returns null on any error so
 * upload never blocks on extraction trouble.
 *
 * Output is bounded to 64KB so Document rows stay reasonable in size
 * (the average bank statement PDF extracts to ~30KB of text, which
 * fits comfortably; massive contracts could blow out the row size
 * without the cap).
 *
 * Why `pdf-parse` over alternatives:
 *   - Zero native deps (pure JS) so it runs in Vercel's Node runtime
 *   - Wraps pdf.js with a Node-friendly API
 *   - Widely used (>500k weekly downloads) — primitive + battle-tested
 *   - Apache-2.0 licence
 */

/** Hard cap on extracted text we persist to Document.extractedText. */
export const MAX_EXTRACTED_TEXT_BYTES = 64 * 1024; // 64KB

/**
 * Extract raw text from a PDF buffer.
 *
 * Returns:
 *   - the extracted text (trimmed, capped at 64KB) on success
 *   - null on any failure — caller should treat this as "extraction
 *     not available" rather than an error
 *
 * Why we use a dynamic import: `pdf-parse` runs initialisation code
 * at module load that touches the file system (its built-in test
 * fixture). Importing it lazily inside the function keeps that out
 * of the cold-start path and makes the dep tree-shakeable for
 * callers that never reach this path.
 */
export async function extractPdfText(
  buffer: Buffer | Uint8Array
): Promise<string | null> {
  try {
    // Lazy import — pdf-parse's index.js has top-level filesystem
    // access that breaks build-time tree shaking otherwise. We route
    // the type through `unknown` because the module's published types
    // don't quite match the runtime shape (it exports both an esm and
    // a cjs surface).
    const mod = (await import("pdf-parse")) as unknown as
      | { default: (b: Buffer) => Promise<{ text: string }> }
      | ((b: Buffer) => Promise<{ text: string }>);
    const parsePdf =
      typeof mod === "function" ? mod : mod.default;
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const result = await parsePdf(buf);
    const text = (result?.text ?? "").trim();
    if (!text) return null;
    return capText(text);
  } catch (err) {
    console.warn("[pdf-extract] failed", err);
    return null;
  }
}

/**
 * Truncate text to the byte cap, appending an ellipsis when cut. The
 * byte count vs char count distinction matters because the storage
 * limit is bytes (DB column TEXT) but JS string length is UTF-16 code
 * units. We use `Buffer.byteLength` for the real measurement.
 */
export function capText(text: string): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= MAX_EXTRACTED_TEXT_BYTES) return text;
  // Binary search down to a substring that fits.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const slice = text.slice(0, mid);
    if (Buffer.byteLength(slice, "utf8") <= MAX_EXTRACTED_TEXT_BYTES - 3) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + "...";
}
