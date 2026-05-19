import { describe, it, expect } from "vitest";
import {
  formatTotalInWords,
  intToIndianWords,
} from "@/lib/sales/total-in-words";

describe("intToIndianWords", () => {
  it("returns 'Zero' for 0", () => {
    expect(intToIndianWords(0)).toBe("Zero");
  });
  it("handles single digits", () => {
    expect(intToIndianWords(1)).toBe("One");
    expect(intToIndianWords(9)).toBe("Nine");
  });
  it("handles teens", () => {
    expect(intToIndianWords(11)).toBe("Eleven");
    expect(intToIndianWords(15)).toBe("Fifteen");
    expect(intToIndianWords(19)).toBe("Nineteen");
  });
  it("handles tens with hyphen for compound", () => {
    expect(intToIndianWords(20)).toBe("Twenty");
    expect(intToIndianWords(47)).toBe("Forty-Seven");
    expect(intToIndianWords(99)).toBe("Ninety-Nine");
  });
  it("handles hundreds", () => {
    expect(intToIndianWords(100)).toBe("One Hundred");
    expect(intToIndianWords(800)).toBe("Eight Hundred");
    expect(intToIndianWords(847)).toBe("Eight Hundred Forty-Seven");
  });
  it("handles thousands", () => {
    expect(intToIndianWords(1000)).toBe("One Thousand");
    expect(intToIndianWords(47800)).toBe("Forty-Seven Thousand Eight Hundred");
  });
  it("handles lakh (Indian grouping)", () => {
    expect(intToIndianWords(100000)).toBe("One Lakh");
    expect(intToIndianWords(247800)).toBe(
      "Two Lakh Forty-Seven Thousand Eight Hundred"
    );
  });
  it("handles crore", () => {
    expect(intToIndianWords(10000000)).toBe("One Crore");
    expect(intToIndianWords(12345678)).toBe(
      "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight"
    );
  });
});

describe("formatTotalInWords", () => {
  it("matches the reference PDF for ₹2,47,800", () => {
    expect(formatTotalInWords(247800)).toBe(
      "Indian Rupee Two Lakh Forty-Seven Thousand Eight Hundred Only"
    );
  });
  it("returns the canonical sentence for ₹0", () => {
    expect(formatTotalInWords(0)).toBe("Indian Rupee Zero Only");
  });
  it("includes paise when non-zero", () => {
    expect(formatTotalInWords(1234.56)).toBe(
      "Indian Rupee One Thousand Two Hundred Thirty-Four and Fifty-Six Paise Only"
    );
  });
  it("rounds paise to nearest integer", () => {
    // 100.014 → paise = round(0.014 * 100) = 1
    expect(formatTotalInWords(100.014)).toBe(
      "Indian Rupee One Hundred and One Paise Only"
    );
  });
  it("handles negative amounts", () => {
    expect(formatTotalInWords(-247800)).toBe(
      "Negative Indian Rupee Two Lakh Forty-Seven Thousand Eight Hundred Only"
    );
  });
  it("accepts string input", () => {
    expect(formatTotalInWords("247800")).toBe(
      "Indian Rupee Two Lakh Forty-Seven Thousand Eight Hundred Only"
    );
  });
  it("returns empty string for NaN", () => {
    expect(formatTotalInWords(Number.NaN)).toBe("");
  });
});
