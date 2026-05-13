import { describe, it, expect } from "vitest";
import { detectFormat } from "@/lib/banking/format-detection";

/**
 * Tests for BNK-G format detection.
 *
 * Extension-first, content-sniff as fallback. Defaults to CSV when
 * nothing else matches (the most permissive parser; user can still
 * fix the column map in Step 2).
 */

describe("detectFormat — by extension", () => {
  it("detects .csv", () => {
    expect(detectFormat("statement.csv", "Date,Amount\n2026-01-01,100")).toBe("CSV");
  });
  it("detects .tsv as CSV", () => {
    expect(detectFormat("statement.tsv", "Date\tAmount\n2026-01-01\t100")).toBe("CSV");
  });
  it("detects .ofx", () => {
    expect(detectFormat("statement.ofx", "irrelevant")).toBe("OFX");
  });
  it("detects .qfx as OFX", () => {
    expect(detectFormat("export.qfx", "irrelevant")).toBe("OFX");
  });
  it("detects .qif", () => {
    expect(detectFormat("Q-export.qif", "irrelevant")).toBe("QIF");
  });
});

describe("detectFormat — by content sniff (extension absent or .txt/.xml)", () => {
  it("detects OFX from OFXHEADER on .txt", () => {
    const sample = `OFXHEADER:100\nDATA:OFXSGML\n<OFX>...`;
    expect(detectFormat("export.txt", sample)).toBe("OFX");
  });
  it("detects OFX 2.x from <?xml + <OFX> on .xml", () => {
    const sample = `<?xml version="1.0" encoding="UTF-8"?>\n<OFX>\n  <BANKMSGSRSV1>...`;
    expect(detectFormat("export.xml", sample)).toBe("OFX");
  });
  it("detects CAMT.053 from <?xml + BkToCstmrStmt on .xml", () => {
    const sample = `<?xml version="1.0"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">\n  <BkToCstmrStmt>`;
    expect(detectFormat("statement.xml", sample)).toBe("CAMT053");
  });
  it("detects QIF from !Type: on .txt", () => {
    const sample = `!Type:Bank\nD04/15/2026\nT-2400.00\nPAWS\n^`;
    expect(detectFormat("export.txt", sample)).toBe("QIF");
  });
  it("falls back to CSV for unknown content", () => {
    expect(detectFormat("export.txt", "no markers here, just text")).toBe("CSV");
  });
  it("falls back to CSV for unknown extension", () => {
    expect(detectFormat("statement.weird", "Date,Amount")).toBe("CSV");
  });
});
