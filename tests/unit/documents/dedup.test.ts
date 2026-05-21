import { describe, it, expect } from "vitest";
import { sha256Buffer, isSha256Hex, dupWarning } from "@/lib/documents/dedup";

describe("documents/dedup", () => {
  describe("sha256Buffer", () => {
    it("returns the canonical SHA-256 of an empty buffer", () => {
      // Reference: well-known hash of "" — every SHA-256 impl agrees.
      expect(sha256Buffer(Buffer.from(""))).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      );
    });

    it("returns the canonical SHA-256 of 'abc'", () => {
      // RFC reference vector.
      expect(sha256Buffer(Buffer.from("abc"))).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    });

    it("accepts a Uint8Array (browser-style binary)", () => {
      const bytes = new Uint8Array([0x61, 0x62, 0x63]); // "abc"
      expect(sha256Buffer(bytes)).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
    });

    it("produces different digests for different content", () => {
      expect(sha256Buffer(Buffer.from("a"))).not.toBe(
        sha256Buffer(Buffer.from("b"))
      );
    });

    it("is deterministic — same buffer always yields the same hash", () => {
      const buf = Buffer.from("Quikfinance receipt 2026");
      const a = sha256Buffer(buf);
      const b = sha256Buffer(buf);
      expect(a).toBe(b);
    });

    it("returns 64-character lowercase hex", () => {
      const digest = sha256Buffer(Buffer.from("anything"));
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("isSha256Hex", () => {
    it("accepts valid lowercase hex of length 64", () => {
      expect(
        isSha256Hex(
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
      ).toBe(true);
    });

    it("rejects uppercase hex (we mandate lowercase for consistency)", () => {
      expect(
        isSha256Hex(
          "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"
        )
      ).toBe(false);
    });

    it("rejects short / long strings", () => {
      expect(isSha256Hex("abc123")).toBe(false);
      expect(isSha256Hex("a".repeat(63))).toBe(false);
      expect(isSha256Hex("a".repeat(65))).toBe(false);
    });

    it("rejects strings with non-hex characters", () => {
      expect(isSha256Hex("z".repeat(64))).toBe(false);
      expect(isSha256Hex(" ".repeat(64))).toBe(false);
    });

    it("rejects non-strings", () => {
      expect(isSha256Hex(null)).toBe(false);
      expect(isSha256Hex(undefined)).toBe(false);
      expect(isSha256Hex(42 as unknown)).toBe(false);
      expect(isSha256Hex({} as unknown)).toBe(false);
    });
  });

  describe("dupWarning", () => {
    it("includes the existing name + a formatted date", () => {
      const msg = dupWarning("statement.pdf", new Date("2026-05-12T10:30:00Z"));
      expect(msg).toContain("statement.pdf");
      expect(msg).toContain("12");
      expect(msg).toContain("2026");
      expect(msg).toContain("May");
    });

    it("uses 'already uploaded' phrasing", () => {
      const msg = dupWarning("x", new Date());
      expect(msg.toLowerCase()).toContain("already uploaded");
    });
  });
});
