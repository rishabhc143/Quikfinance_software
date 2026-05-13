import { describe, it, expect } from "vitest";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
} from "@/lib/reports/csv-export";

/**
 * Tests for RPT-A CSV export helpers.
 */

describe("toCsv — empty / single", () => {
  it("returns empty string for empty input with no explicit columns", () => {
    expect(toCsv([])).toBe("");
  });

  it("returns just the header when columns supplied but no rows", () => {
    expect(toCsv([], ["A", "B"])).toBe("A,B");
  });

  it("renders one row with auto-discovered columns", () => {
    expect(toCsv([{ name: "Foo", value: 42 }])).toBe("name,value\r\nFoo,42");
  });
});

describe("toCsv — column ordering", () => {
  it("respects an explicit columns list", () => {
    const csv = toCsv([{ a: 1, b: 2, c: 3 }], ["c", "a"]);
    expect(csv).toBe("c,a\r\n3,1");
  });

  it("missing cells render as empty", () => {
    const csv = toCsv([{ a: 1 }, { b: 2 }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,\r\n,2");
  });
});

describe("toCsv — RFC 4180 escaping", () => {
  it("quotes fields with commas", () => {
    expect(toCsv([{ x: "a,b" }])).toBe('x\r\n"a,b"');
  });

  it("quotes fields with embedded double quotes and escapes them", () => {
    expect(toCsv([{ x: 'he said "hi"' }])).toBe('x\r\n"he said ""hi"""');
  });

  it("quotes fields with newlines", () => {
    expect(toCsv([{ x: "line1\nline2" }])).toBe('x\r\n"line1\nline2"');
  });

  it("numbers render unquoted", () => {
    expect(toCsv([{ x: 1234.5 }])).toBe("x\r\n1234.5");
  });

  it("null / undefined render as empty cell", () => {
    const csv = toCsv([{ x: null, y: undefined, z: 0 }], ["x", "y", "z"]);
    expect(csv).toBe("x,y,z\r\n,,0");
  });
});

describe("csvResponse", () => {
  it("sets Content-Type and Content-Disposition", () => {
    const res = csvResponse("report-20260513", "a,b\r\n1,2");
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/i);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="report-20260513.csv"/
    );
  });

  it("sanitises unsafe characters in filename", () => {
    const res = csvResponse("a/b\\c d", "x");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /filename="a_b_c_d.csv"/
    );
  });
});

describe("csvDateSuffix", () => {
  it("formats yyyymmdd in UTC", () => {
    expect(csvDateSuffix(new Date("2026-04-15T18:00:00Z"))).toBe("20260415");
  });

  it("pads single-digit months and days", () => {
    expect(csvDateSuffix(new Date("2026-01-05T00:00:00Z"))).toBe("20260105");
  });
});
