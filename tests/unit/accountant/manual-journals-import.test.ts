import { describe, it, expect } from "vitest";
import {
  parseCsv,
  indexHeaders,
  parseIsoDate,
  parseAmount,
  parseManualJournalsCsv,
  MAX_IMPORT_ROWS,
  type ParseInput,
} from "@/lib/accounting/manual-journals-import";

/**
 * ACCT-A.4.b — Tests for the pure CSV import parser. Pins the
 * RFC 4180 parse, header detection, row grouping, validation, and
 * error reporting so the wizard can't regress silently.
 */

// ───────────────────────── helpers ─────────────────────────

function makeLookups(opts: {
  accountsByCode?: Record<string, string>;
  accountsByName?: Record<string, string>;
  contactsByName?: Record<string, string>;
  projectsByName?: Record<string, string>;
} = {}): Omit<ParseInput, "csv"> {
  const map = (obj?: Record<string, string>) => {
    const m = new Map<string, { id: string }>();
    for (const [k, v] of Object.entries(obj ?? {})) {
      m.set(k, { id: v });
    }
    return m;
  };
  return {
    accountsByCode: map(opts.accountsByCode),
    accountsByName: map(opts.accountsByName),
    contactsByName: map(opts.contactsByName),
    projectsByName: map(opts.projectsByName),
  };
}

const HEADER =
  "Date,Journal Number,Account Code,Account Name,Debit,Credit,Description,Currency,Reporting Method,Contact,Project,Notes,Reference Number";

// ───────────────────────── parseCsv ─────────────────────────

describe("parseCsv (RFC 4180)", () => {
  it("splits simple comma-separated values", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respects quoted fields with embedded commas", () => {
    expect(parseCsv(`a,"b,c",d`)).toEqual([["a", "b,c", "d"]]);
  });

  it("respects quoted fields with embedded newlines", () => {
    expect(parseCsv(`a,"line\n2",c`)).toEqual([["a", "line\n2", "c"]]);
  });

  it("unescapes doubled inner quotes", () => {
    expect(parseCsv(`a,"He said ""hi""",c`)).toEqual([
      ["a", 'He said "hi"', "c"],
    ]);
  });

  it("handles both \\r\\n and \\n line endings", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drops trailing empty rows", () => {
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

// ───────────────────────── indexHeaders ─────────────────────────

describe("indexHeaders", () => {
  it("returns the column index when all required headers are present", () => {
    const res = indexHeaders([
      "Date",
      "Journal Number",
      "Account Code",
      "Debit",
      "Credit",
    ]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.index.get("Journal Number")).toBe(1);
  });

  it("complains when a required column is missing", () => {
    const res = indexHeaders(["Date", "Journal Number", "Debit", "Credit"]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes("Account Code"))).toBe(true);
    }
  });

  it("matches case-insensitively", () => {
    const res = indexHeaders([
      "date",
      "journal number",
      "ACCOUNT CODE",
      "Debit",
      "credit",
    ]);
    expect(res.ok).toBe(true);
  });

  it("accepts and ignores unknown columns (forward-compat)", () => {
    const res = indexHeaders([
      "Date",
      "Journal Number",
      "Account Code",
      "Debit",
      "Credit",
      "FuturePartyId",
    ]);
    expect(res.ok).toBe(true);
  });
});

// ───────────────────────── parseIsoDate / parseAmount ─────────────────────────

describe("parseIsoDate", () => {
  it("parses yyyy-mm-dd into a UTC Date", () => {
    const d = parseIsoDate("2026-05-13");
    expect(d?.toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });

  it("rejects non-iso shapes", () => {
    expect(parseIsoDate("13/05/2026")).toBeNull();
    expect(parseIsoDate("2026/05/13")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("handles plain integers + decimals", () => {
    expect(parseAmount("100")).toBe(100);
    expect(parseAmount("100.25")).toBe(100.25);
  });

  it("strips thousands separators + currency glyphs", () => {
    expect(parseAmount("1,000.50")).toBe(1000.5);
    expect(parseAmount("₹2,500")).toBe(2500);
    expect(parseAmount("$1,234.56")).toBe(1234.56);
  });

  it("treats empty as zero (CSV exports leave the other column blank)", () => {
    expect(parseAmount("")).toBe(0);
  });

  it("rejects garbage", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.2.3")).toBeNull();
  });
});

// ───────────────────────── parseManualJournalsCsv (end-to-end) ─────────────────────────

describe("parseManualJournalsCsv — happy paths", () => {
  it("groups rows with the same Journal Number into one MJ with N lines", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-1,1000,Cash,1000,0,Rent paid,INR,Accrual and Cash,,,Q1 rent,REF-1",
      "2026-05-13,MJ-1,5000,Rent,0,1000,Rent paid,INR,Accrual and Cash,,,Q1 rent,REF-1",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByCode: { "1000": "acc-cash", "5000": "acc-rent" },
      }),
    });
    expect(res.errors).toEqual([]);
    expect(res.journals).toHaveLength(1);
    const j = res.journals[0];
    expect(j.number).toBe("MJ-1");
    expect(j.lines).toHaveLength(2);
    expect(j.lines[0].accountId).toBe("acc-cash");
    expect(j.lines[1].accountId).toBe("acc-rent");
    expect(j.referenceNumber).toBe("REF-1");
    expect(j.reportingMethod).toBe("ACCRUAL_AND_CASH");
  });

  it("falls back to Account Name when Account Code is blank", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-1,,Cash,100,0,,,Accrual and Cash,,,,",
      "2026-05-13,MJ-1,,Rent,0,100,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByName: { cash: "acc-cash", rent: "acc-rent" },
      }),
    });
    expect(res.errors).toEqual([]);
    expect(res.journals[0].lines[0].accountId).toBe("acc-cash");
  });

  it("resolves Contact + Project by name (case-insensitive)", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-1,1000,Cash,100,0,,,Accrual and Cash,ACME VENDOR,Q1 Marketing,,",
      "2026-05-13,MJ-1,5000,Rent,0,100,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByCode: { "1000": "acc-cash", "5000": "acc-rent" },
        contactsByName: { "acme vendor": "contact-1" },
        projectsByName: { "q1 marketing": "project-1" },
      }),
    });
    expect(res.errors).toEqual([]);
    expect(res.journals[0].lines[0].contactId).toBe("contact-1");
    expect(res.journals[0].lines[0].projectId).toBe("project-1");
    expect(res.journals[0].lines[1].contactId).toBeNull();
  });

  it("skips wholly-empty rows silently", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-1,1000,Cash,100,0,,,Accrual and Cash,,,,",
      "",
      "2026-05-13,MJ-1,5000,Rent,0,100,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByCode: { "1000": "acc-cash", "5000": "acc-rent" },
      }),
    });
    expect(res.errors).toEqual([]);
    expect(res.journals).toHaveLength(1);
  });
});

describe("parseManualJournalsCsv — row errors", () => {
  it("reports an unknown account code", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-1,9999,?,100,0,,,Accrual and Cash,,,,",
      "2026-05-13,MJ-1,5000,Rent,0,100,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({ accountsByCode: { "5000": "acc-rent" } }),
    });
    // The MJ-1 group has one valid line + one invalid line → the
    // group lacks the second leg so balance fails too. We only
    // need to confirm that an Account Code error fired.
    expect(
      res.errors.some(
        (e) => e.field === "Account Code" && e.message.includes("9999")
      )
    ).toBe(true);
  });

  it("reports a bad ISO date", () => {
    const csv = [
      HEADER,
      "13/05/2026,MJ-1,1000,Cash,100,0,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({ accountsByCode: { "1000": "acc-cash" } }),
    });
    expect(res.errors.some((e) => e.field === "Date")).toBe(true);
    expect(res.journals).toEqual([]);
  });

  it("rejects a journal whose lines are not balanced (per-MJ validator)", () => {
    const csv = [
      HEADER,
      "2026-05-13,MJ-OFF,1000,Cash,100,0,,,Accrual and Cash,,,,",
      "2026-05-13,MJ-OFF,5000,Rent,0,90,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByCode: { "1000": "acc-cash", "5000": "acc-rent" },
      }),
    });
    expect(res.journals).toEqual([]);
    expect(
      res.errors.some((e) => e.message.includes("must equal"))
    ).toBe(true);
  });

  it("keeps good journals when one journal in the file is bad (per-journal isolation)", () => {
    const csv = [
      HEADER,
      // MJ-GOOD: balanced
      "2026-05-13,MJ-GOOD,1000,Cash,100,0,,,Accrual and Cash,,,,",
      "2026-05-13,MJ-GOOD,5000,Rent,0,100,,,Accrual and Cash,,,,",
      // MJ-BAD: unbalanced
      "2026-05-13,MJ-BAD,1000,Cash,100,0,,,Accrual and Cash,,,,",
      "2026-05-13,MJ-BAD,5000,Rent,0,90,,,Accrual and Cash,,,,",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups({
        accountsByCode: { "1000": "acc-cash", "5000": "acc-rent" },
      }),
    });
    expect(res.journals).toHaveLength(1);
    expect(res.journals[0].number).toBe("MJ-GOOD");
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("complains about missing required columns + returns no journals", () => {
    const csv = [
      "Date,Journal Number,Debit,Credit",
      "2026-05-13,MJ-1,100,0",
    ].join("\n");
    const res = parseManualJournalsCsv({
      csv,
      ...makeLookups(),
    });
    expect(res.journals).toEqual([]);
    expect(
      res.errors.some((e) => e.message.includes("Account Code"))
    ).toBe(true);
  });

  it("rejects oversized files with a single top-level error", () => {
    const rows = [HEADER];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) {
      rows.push(`2026-05-13,MJ-${i},1000,Cash,100,0,,,,,,,`);
    }
    const res = parseManualJournalsCsv({
      csv: rows.join("\n"),
      ...makeLookups({ accountsByCode: { "1000": "acc-cash" } }),
    });
    expect(res.journals).toEqual([]);
    expect(res.errors[0].message).toMatch(/Too many rows/);
  });
});
