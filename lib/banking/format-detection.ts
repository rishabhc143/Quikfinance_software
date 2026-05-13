/**
 * BNK-G — Bank-statement file format detection.
 *
 * Picks one of the four supported formats from the file's name + the
 * first chunk of its content. The wizard calls this on file pick and
 * the server action calls it again to be safe (don't trust the client).
 *
 * Strategy:
 *   1. Extension first — fastest and almost always right.
 *   2. Content sniff — covers `.txt` exports and mis-named files.
 *      Look for distinctive markers near the top of the file.
 *
 * Returns "CSV" as the catch-all default — that's the most permissive
 * parser and the wizard's column-mapping step will surface real errors.
 */

export type BankStatementFormat = "CSV" | "OFX" | "QIF" | "CAMT053";

/** Lower-cased file extension (without dot), or "" if none. */
function extOf(fileName: string): string {
  const m = /\.([^.]+)$/.exec(fileName);
  return m ? m[1].toLowerCase() : "";
}

export function detectFormat(
  fileName: string,
  contentSample: string
): BankStatementFormat {
  const ext = extOf(fileName);
  const sample = contentSample.slice(0, 1024); // first 1 KB is plenty

  // 1. Extension — fast path.
  switch (ext) {
    case "ofx":
    case "qfx":
      return "OFX";
    case "qif":
      return "QIF";
    case "csv":
    case "tsv":
    case "txt":
      // .txt can be either CSV or QIF — fall through to content sniff.
      if (ext !== "txt") return "CSV";
      break;
    case "xml":
      // .xml can be CAMT.053, OFX 2.x, or something unrelated.
      // Fall through to content sniff.
      break;
  }

  // 2. Content sniff.
  if (/<\?xml\s/i.test(sample)) {
    if (/BkToCstmrStmt|camt\.053/i.test(sample)) return "CAMT053";
    if (/<OFX[\s>]/i.test(sample)) return "OFX";
  }
  if (/^OFXHEADER:/im.test(sample)) return "OFX";
  if (/<OFX[\s>]/i.test(sample)) return "OFX";
  // QIF files start with !Type:<Bank|Cash|CCard|...> on the first line.
  if (/^!Type:/im.test(sample)) return "QIF";

  return "CSV";
}
