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
 * DOC-D4.1: Password-aware extraction.
 *
 * The base `extractPdfText` doesn't pass a password to pdf-parse and
 * silently swallows encryption errors. This helper:
 *   - Uses `pdfjs-dist` directly so we can pass a password
 *   - Returns `{ needsPassword: true }` when pdfjs throws
 *     PasswordException (wrong password OR no password supplied)
 *   - Returns extracted text on success
 *   - Bubbles up unexpected errors (corrupted PDF, etc.) as a third
 *     `error` channel
 *
 * Why a separate helper: pdf-parse v2 doesn't expose a `password`
 * option in its public API, so we go to the underlying pdfjs lib
 * directly. pdfjs-dist is already in our dep tree via pdf-parse.
 */
export type PdfExtractResult =
  | { kind: "ok"; text: string }
  | { kind: "needs-password" }
  | { kind: "error"; reason: string };

export async function extractPdfTextWithPassword(
  buffer: Buffer | Uint8Array,
  password?: string
): Promise<PdfExtractResult> {
  try {
    // Lazy import — pdfjs-dist has a noisy worker setup at module
    // load that we don't want on the cold-start path.
    const pdfjs = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");

    // Run pdfjs without a worker (Node doesn't have one); this is
    // slower but works in serverless functions.
    pdfjs.GlobalWorkerOptions.workerSrc = "";

    const data =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      password,
      // Silence pdfjs's noisy warnings about CMap / font subset.
      verbosity: 0,
    });

    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (err: unknown) {
      const e = err as { name?: string; code?: number; message?: string };
      // pdfjs throws PasswordException with code 1 (no password
      // supplied) or 2 (incorrect password). Either way the caller
      // should prompt the user.
      if (e?.name === "PasswordException") {
        return { kind: "needs-password" };
      }
      return {
        kind: "error",
        reason: e?.message ?? "Failed to open PDF",
      };
    }

    let text = "";
    const maxPages = Math.min(doc.numPages, 50); // Cap at 50 pages.
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ");
      text += pageText + "\n";
    }

    const trimmed = text.trim();
    if (!trimmed) {
      // Likely a scanned image PDF — no text layer.
      return { kind: "error", reason: "No text in PDF (scanned image?)" };
    }
    return { kind: "ok", text: capText(trimmed) };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { kind: "error", reason: e?.message ?? "Extraction failed" };
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
