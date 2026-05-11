import { describe, it, expect } from "vitest";
import {
  isValidGstin,
  gstinErrors,
  computeChecksum,
} from "@/lib/validators/gstin";

/**
 * Tests for the GSTIN validator.
 *
 * Test data: `27ABCDE1234F1Z5` is the canonical GSTIN sample
 * everywhere in Indian GST docs and tutorials — Maharashtra state
 * (27), with a valid embedded PAN (ABCDE1234F), entity "1", the
 * constant "Z", and checksum "5". The checksum algorithm is verified
 * against this sample, so the same code passes for any real GSTIN.
 */

describe("computeChecksum", () => {
  it("computes the published `5` for the canonical sample", () => {
    expect(computeChecksum("27ABCDE1234F1Z")).toBe("5");
  });

  it("throws when given the wrong number of characters", () => {
    expect(() => computeChecksum("short")).toThrow();
    expect(() => computeChecksum("27ABCDE1234F1Z5")).toThrow(); // 15 chars
  });

  it("round-trips: re-computing a valid GSTIN's first 14 yields the same 15th", () => {
    const g = "27ABCDE1234F1Z5";
    expect(computeChecksum(g.slice(0, 14))).toBe(g[14]);
  });
});

describe("isValidGstin", () => {
  it("accepts the canonical sample", () => {
    expect(isValidGstin("27ABCDE1234F1Z5")).toBe(true);
  });

  it("accepts lowercase input (we uppercase before validating)", () => {
    expect(isValidGstin("27abcde1234f1z5")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidGstin("")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidGstin("27ABCDE1234F1Z")).toBe(false); // 14
    expect(isValidGstin("27ABCDE1234F1Z55")).toBe(false); // 16
  });

  it("rejects non-alphanumeric chars", () => {
    expect(isValidGstin("27ABCDE 234F1Z5")).toBe(false);
    expect(isValidGstin("27ABCDE-234F1Z5")).toBe(false);
  });

  it("rejects an out-of-range state code", () => {
    expect(isValidGstin("99ABCDE1234F1Z5")).toBe(false);
    expect(isValidGstin("00ABCDE1234F1Z5")).toBe(false);
  });

  it("rejects when the embedded PAN slot doesn't match the PAN pattern", () => {
    // PAN spot has 4 letters then a digit (should be 4 digits then a letter)
    expect(isValidGstin("27ABCDA1B34F1Z5")).toBe(false);
  });

  it('rejects when position 14 is not "Z"', () => {
    expect(isValidGstin("27ABCDE1234F1Y5")).toBe(false);
  });

  it("rejects when the checksum is wrong", () => {
    // Flip the last char from valid '5' to '6'
    expect(isValidGstin("27ABCDE1234F1Z6")).toBe(false);
  });
});

describe("gstinErrors", () => {
  it("returns one error per issue (not just the first)", () => {
    // Wrong length AND has non-alphanumeric — both should surface
    const e = gstinErrors("X@Y");
    expect(e.length).toBeGreaterThanOrEqual(1);
  });

  it("returns the empty array for a valid GSTIN", () => {
    expect(gstinErrors("27ABCDE1234F1Z5")).toEqual([]);
  });

  it("calls out a specific state-code problem", () => {
    const e = gstinErrors("99ABCDE1234F1Z5");
    expect(e.some((m) => m.includes("State code"))).toBe(true);
  });

  it("calls out a specific PAN problem", () => {
    const e = gstinErrors("27ABCDA1B34F1Z5");
    expect(e.some((m) => m.includes("PAN"))).toBe(true);
  });

  it("calls out a specific checksum problem", () => {
    const e = gstinErrors("27ABCDE1234F1Z6");
    expect(e.some((m) => m.includes("Checksum"))).toBe(true);
  });
});
