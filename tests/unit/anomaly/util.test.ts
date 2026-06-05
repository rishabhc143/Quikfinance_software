import { describe, it, expect } from "vitest";
import { fpKey, formatMoneyForDescription } from "@/lib/anomaly/util";

describe("fpKey", () => {
  it("is order-invariant in the sortedIds arg", () => {
    expect(fpKey("duplicate_bill", ["b", "a"])).toBe(
      fpKey("duplicate_bill", ["a", "b"])
    );
  });

  it("differs across detectorKeys for the same ids", () => {
    expect(fpKey("dup_bill", ["a", "b"])).not.toBe(
      fpKey("missing_recurring", ["a", "b"])
    );
  });

  it("is stable across calls with the same input", () => {
    const a = fpKey("dup", ["x", "y", "z"]);
    const b = fpKey("dup", ["x", "y", "z"]);
    expect(a).toBe(b);
  });

  it("does not mutate the input array", () => {
    const input = ["z", "a", "m"];
    fpKey("dup", input);
    expect(input).toEqual(["z", "a", "m"]);
  });

  it("differs when one id changes", () => {
    expect(fpKey("dup", ["a", "b"])).not.toBe(fpKey("dup", ["a", "c"]));
  });
});

describe("formatMoneyForDescription", () => {
  it("formats INR with rupee symbol", () => {
    const out = formatMoneyForDescription(1234.56, "INR");
    // Intl output varies by ICU version — assert it contains the
    // significant digits + currency hint rather than full match.
    expect(out).toMatch(/1,234/);
    expect(out).toMatch(/₹|INR/);
  });

  it("falls back to currency code on invalid input", () => {
    const out = formatMoneyForDescription(100, "XYZNOPE");
    // Either Intl accepts it (some locales) or our catch fallback fires.
    expect(out).toMatch(/XYZNOPE|100/);
  });

  it("handles zero", () => {
    expect(formatMoneyForDescription(0, "INR")).toMatch(/0/);
  });

  it("handles negative", () => {
    const out = formatMoneyForDescription(-50, "INR");
    expect(out).toMatch(/50/);
  });
});
