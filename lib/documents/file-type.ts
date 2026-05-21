/**
 * DOC-D1: MIME-to-bucket mapping for the "File Type" filter on the
 * Documents page and the file icon renderer in the table.
 *
 * Buckets match Zoho's filter dropdown options:
 *   - PDF
 *   - Image (jpg / png / webp / heic / heif / gif / svg)
 *   - Spreadsheet (csv / xls / xlsx / ods)
 *   - Word (doc / docx / odt / txt / rtf)
 *   - Other (anything else)
 *
 * Pure, no DB / Prisma dependency. Re-used by the file-type-filter
 * <select> and the documents-table icon column.
 */
export type FileTypeBucket = "pdf" | "image" | "spreadsheet" | "word" | "other";

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

const SPREADSHEET_MIMES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const WORD_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "text/plain",
  "text/rtf",
  "application/rtf",
]);

/**
 * Map a MIME string to its bucket. Falls back to "other" when the MIME
 * is null/empty or doesn't match a known group.
 */
export function fileTypeFromMime(mime: string | null | undefined): FileTypeBucket {
  if (!mime) return "other";
  const m = mime.toLowerCase().trim();
  if (m === "application/pdf") return "pdf";
  if (IMAGE_MIMES.has(m) || m.startsWith("image/")) return "image";
  if (SPREADSHEET_MIMES.has(m)) return "spreadsheet";
  if (WORD_MIMES.has(m)) return "word";
  return "other";
}

/**
 * Human label for the filter <select>, also used as the badge text on
 * each row in the documents table.
 */
export function labelForFileType(bucket: FileTypeBucket): string {
  switch (bucket) {
    case "pdf":
      return "PDF";
    case "image":
      return "Image";
    case "spreadsheet":
      return "Spreadsheet";
    case "word":
      return "Word";
    case "other":
      return "Other";
  }
}

/**
 * All buckets in display order — used by the filter dropdown to render
 * options. "all" is handled separately by the consumer.
 */
export const FILE_TYPE_BUCKETS: readonly FileTypeBucket[] = [
  "pdf",
  "image",
  "spreadsheet",
  "word",
  "other",
];

/**
 * Convert a "File Type: …" URL param value back to a bucket, or null
 * for "all". Tolerates unknown values by returning null (defaults to
 * showing everything).
 */
export function parseFileTypeParam(
  raw: string | null | undefined
): FileTypeBucket | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === "all" || v === "") return null;
  if ((FILE_TYPE_BUCKETS as readonly string[]).includes(v)) {
    return v as FileTypeBucket;
  }
  return null;
}
