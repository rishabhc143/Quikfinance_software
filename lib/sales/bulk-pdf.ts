import JSZip from "jszip";

/**
 * Helper for the M16 bulk-print routes. Each module passes an array of
 * already-resolved `{ filename, bytes }` items; we zip them and return a
 * `Uint8Array` ready to ship as the response body.
 *
 * Why the layer of indirection: every module's PDF payload shape is
 * different (Quote vs Invoice vs SalesOrder field names). The route
 * handler iterates ids, calls `renderSalesDocumentPdf` with the
 * module-specific shape, then hands us the bytes for zipping.
 */
export type PdfBundleItem = {
  filename: string;
  bytes: Buffer | Uint8Array;
};

export async function zipPdfs(items: PdfBundleItem[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const it of items) {
    zip.file(it.filename, it.bytes);
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/**
 * Parse the comma-separated `ids` query param. Caps at 100 to keep
 * memory predictable — anything beyond that should use a queue.
 */
export function parseIds(raw: string | null, cap = 100): string[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.slice(0, cap);
}
