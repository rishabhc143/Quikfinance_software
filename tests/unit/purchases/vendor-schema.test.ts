import { describe, it, expect } from "vitest";
import { vendorSchema } from "@/lib/validations/vendor";

/**
 * Tests for the vendor zod schema in `lib/validations/vendor.ts`.
 *
 * Coverage:
 *  - happy-path: minimal vendor passes
 *  - PAN regex enforcement (catches typos before they hit the DB)
 *  - IFSC regex enforcement on bank accounts
 *  - Re-enter-account-number cross-field validation
 *  - MSME number required when msmeRegistered=true
 *  - Email format
 *  - Display name required
 */

function baseVendor() {
  return {
    displayName: "Acme Supplies",
  };
}

describe("vendorSchema — happy path", () => {
  it("accepts a vendor with just a display name", () => {
    const result = vendorSchema.safeParse(baseVendor());
    expect(result.success).toBe(true);
  });

  it("accepts a fully-filled vendor", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      salutation: "Mr.",
      firstName: "Ravi",
      lastName: "Kumar",
      companyName: "Acme Supplies Pvt Ltd",
      email: "ravi@acme.example",
      workPhone: "9876543210",
      pan: "ABCDE1234F",
      gstin: "27ABCDE1234F1Z5",
      currency: "INR",
      bankAccounts: [
        {
          accountHolderName: "Acme Supplies Pvt Ltd",
          bankName: "HDFC",
          accountNumber: "1234567890",
          reEnteredAccountNumber: "1234567890",
          ifscCode: "HDFC0001234",
          isDefault: true,
        },
      ],
      addresses: [
        {
          kind: "billing" as const,
          country: "India",
          addressLine1: "1 MG Road",
          city: "Mumbai",
          state: "Maharashtra",
          zipCode: "400001",
          isDefault: true,
        },
      ],
      contactPersons: [
        {
          salutation: "Mr.",
          firstName: "Ravi",
          lastName: "Kumar",
          email: "ravi@acme.example",
          isPrimary: true,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("vendorSchema — required fields", () => {
  it("rejects when displayName is missing", () => {
    const result = vendorSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects when displayName is an empty string", () => {
    const result = vendorSchema.safeParse({ displayName: "" });
    expect(result.success).toBe(false);
  });
});

describe("vendorSchema — PAN validation", () => {
  it("accepts a valid PAN", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      pan: "ABCDE1234F",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty PAN (the field is optional)", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      pan: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a PAN with digits where letters belong", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      pan: "12345ABCDE",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/PAN must be/);
    }
  });

  it("rejects a PAN with the wrong length", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      pan: "ABCDE1234",
    });
    expect(result.success).toBe(false);
  });
});

describe("vendorSchema — bank account IFSC", () => {
  function withBank(bank: Record<string, unknown>) {
    return {
      ...baseVendor(),
      bankAccounts: [
        {
          accountNumber: "1234567890",
          reEnteredAccountNumber: "1234567890",
          ifscCode: "HDFC0001234",
          ...bank,
        },
      ],
    };
  }

  it("accepts a valid IFSC code", () => {
    const result = vendorSchema.safeParse(withBank({}));
    expect(result.success).toBe(true);
  });

  it("rejects an IFSC missing the central '0'", () => {
    const result = vendorSchema.safeParse(
      withBank({ ifscCode: "HDFCX001234" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an IFSC with lowercase letters", () => {
    const result = vendorSchema.safeParse(
      withBank({ ifscCode: "hdfc0001234" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an IFSC that's too short", () => {
    const result = vendorSchema.safeParse(
      withBank({ ifscCode: "HDFC00012" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an IFSC that's too long", () => {
    const result = vendorSchema.safeParse(
      withBank({ ifscCode: "HDFC00012345" })
    );
    expect(result.success).toBe(false);
  });
});

describe("vendorSchema — re-enter account number", () => {
  it("passes when re-entered matches", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      bankAccounts: [
        {
          accountNumber: "9876543210",
          reEnteredAccountNumber: "9876543210",
          ifscCode: "ICIC0123456",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects when re-entered does not match", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      bankAccounts: [
        {
          accountNumber: "9876543210",
          reEnteredAccountNumber: "9876543299", // typo
          ifscCode: "ICIC0123456",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/does not match/);
    }
  });

  it("passes when re-entered is omitted (the mirror is UI-only)", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      bankAccounts: [
        {
          accountNumber: "9876543210",
          ifscCode: "ICIC0123456",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("vendorSchema — MSME registration", () => {
  it("requires MSME number when msmeRegistered=true", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      msmeRegistered: true,
      msmeNumber: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/MSME number/);
    }
  });

  it("accepts MSME=true with a number provided", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      msmeRegistered: true,
      msmeNumber: "UDYAM-MH-01-0000123",
      msmeCategory: "MICRO",
    });
    expect(result.success).toBe(true);
  });

  it("does not require MSME number when MSME is off", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      msmeRegistered: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("vendorSchema — email", () => {
  it("accepts a valid email", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      email: "buyer@vendor.example",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty email (the field is optional)", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a clearly malformed email", () => {
    const result = vendorSchema.safeParse({
      ...baseVendor(),
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
