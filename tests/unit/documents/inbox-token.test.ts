import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateInboxToken,
  buildInboxEmail,
  tokenFromInboxAddress,
} from "@/lib/documents/inbox-token";

describe("documents/inbox-token", () => {
  describe("generateInboxToken", () => {
    it("returns URL-safe base64 (no '+' or '/' or '=')", () => {
      for (let i = 0; i < 50; i++) {
        const t = generateInboxToken();
        expect(t).not.toMatch(/[+/=]/);
        expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it("produces 32-character tokens (24 bytes base64url)", () => {
      const t = generateInboxToken();
      expect(t.length).toBe(32);
    });

    it("is non-deterministic", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) seen.add(generateInboxToken());
      // 50 tokens of 32 chars from 24-byte random — collisions are
      // astronomically unlikely.
      expect(seen.size).toBe(50);
    });
  });

  describe("buildInboxEmail", () => {
    const ORIG_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN;
    afterEach(() => {
      if (ORIG_DOMAIN === undefined) delete process.env.INBOUND_EMAIL_DOMAIN;
      else process.env.INBOUND_EMAIL_DOMAIN = ORIG_DOMAIN;
    });

    it("returns null when INBOUND_EMAIL_DOMAIN is unset", () => {
      delete process.env.INBOUND_EMAIL_DOMAIN;
      expect(buildInboxEmail("abc123")).toBeNull();
    });

    it("composes <token>.secure@<domain> when configured", () => {
      process.env.INBOUND_EMAIL_DOMAIN = "inbox.quikfinance.app";
      expect(buildInboxEmail("abc123")).toBe(
        "abc123.secure@inbox.quikfinance.app"
      );
    });
  });

  describe("tokenFromInboxAddress", () => {
    const ORIG_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN;
    beforeEach(() => {
      process.env.INBOUND_EMAIL_DOMAIN = "inbox.quikfinance.app";
    });
    afterEach(() => {
      if (ORIG_DOMAIN === undefined) delete process.env.INBOUND_EMAIL_DOMAIN;
      else process.env.INBOUND_EMAIL_DOMAIN = ORIG_DOMAIN;
    });

    it("extracts the token from a well-formed address", () => {
      expect(
        tokenFromInboxAddress("abc123.secure@inbox.quikfinance.app")
      ).toBe("abc123");
    });

    it("is case-insensitive on the domain part", () => {
      expect(
        tokenFromInboxAddress("Abc123.secure@INBOX.QUIKFINANCE.APP")
      ).toBe("Abc123");
    });

    it("tolerates +suffix plus-addressing", () => {
      expect(
        tokenFromInboxAddress(
          "abc123+from-gmail.secure@inbox.quikfinance.app"
        )
      ).toBe("abc123");
    });

    it("returns null for unrelated addresses", () => {
      expect(
        tokenFromInboxAddress("hello@inbox.quikfinance.app")
      ).toBeNull();
      expect(
        tokenFromInboxAddress("abc123.secure@otherdomain.com")
      ).toBeNull();
      expect(tokenFromInboxAddress("malformed")).toBeNull();
    });

    it("returns null when INBOUND_EMAIL_DOMAIN is unset", () => {
      delete process.env.INBOUND_EMAIL_DOMAIN;
      expect(
        tokenFromInboxAddress("abc123.secure@inbox.quikfinance.app")
      ).toBeNull();
    });
  });
});
