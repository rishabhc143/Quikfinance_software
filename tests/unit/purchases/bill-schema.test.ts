import { describe, it, expect } from "vitest";
import { billSchema } from "@/lib/validations/bill";

/**
 * Tests for the Bill zod schema in `lib/validations/bill.ts`.
 *
 * Key cases:
 *  - Bill # is REQUIRED at create time (manual entry, no auto-gen)
 *  - Vendor is required
 *  - At least one line item required
 *  - status defaults to DRAFT
 *  - documentTax TDS/TCS are both accepted
 *  - billableToCustomerId is optional per line
 */

function baseBill(over: Partial<Record<string, unknown>> = {}) {
  return {
    contactId: "vendor-1",
    number: "INV-2026-0001",
    issueDate: "2026-05-01",
    dueDate: "2026-05-31",
    lines: [{ name: "Widgets", quantity: 10, rate: 5 }],
    ...over,
  };
}

describe("billSchema — happy path", () => {
  it("accepts a minimal Bill payload", () => {
    const result = billSchema.safeParse(baseBill());
    expect(result.success).toBe(true);
  });

  it("defaults status to DRAFT", () => {
    const result = billSchema.safeParse(baseBill());
    if (!result.success) throw new Error("Expected success");
    expect(result.data.status).toBe("DRAFT");
  });

  it("accepts WRITTEN_OFF as a valid status", () => {
    const result = billSchema.safeParse(baseBill({ status: "WRITTEN_OFF" }));
    expect(result.success).toBe(true);
  });

  it("accepts a fully-loaded payload with tax + billable line", () => {
    const result = billSchema.safeParse(
      baseBill({
        referenceNumber: "PO-00012",
        subject: "Q2 hardware",
        placeOfSupply: "27",
        documentDiscount: { value: 5, type: "percentage" },
        documentTax: { taxId: "tax-tds-10", type: "TDS" },
        adjustmentLabel: "Rounding",
        adjustmentValue: -0.5,
        attachments: [
          {
            fileName: "po.pdf",
            fileUrl: "/files/po.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
          },
        ],
        lines: [
          {
            name: "Widgets",
            quantity: 10,
            rate: 100,
            taxId: "tax-igst-18",
            billableToCustomerId: "cust-acme",
            accountId: "acct-cogs",
          },
        ],
      })
    );
    expect(result.success).toBe(true);
  });
});

describe("billSchema — required fields", () => {
  it("rejects when number is missing", () => {
    const result = billSchema.safeParse(baseBill({ number: undefined }));
    expect(result.success).toBe(false);
  });

  it("rejects when number is empty", () => {
    const result = billSchema.safeParse(baseBill({ number: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/Bill # is required/);
    }
  });

  it("rejects when contactId is missing", () => {
    const result = billSchema.safeParse(baseBill({ contactId: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects when there are no line items", () => {
    const result = billSchema.safeParse(baseBill({ lines: [] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/At least one line/);
    }
  });

  it("rejects when issueDate is missing", () => {
    const result = billSchema.safeParse(
      baseBill({ issueDate: "not-a-date" })
    );
    expect(result.success).toBe(false);
  });
});

describe("billSchema — line item shape", () => {
  it("rejects empty line.name", () => {
    const result = billSchema.safeParse(
      baseBill({ lines: [{ name: "", quantity: 1, rate: 0 }] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = billSchema.safeParse(
      baseBill({ lines: [{ name: "x", quantity: -1, rate: 5 }] })
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative rate", () => {
    const result = billSchema.safeParse(
      baseBill({ lines: [{ name: "x", quantity: 1, rate: -5 }] })
    );
    expect(result.success).toBe(false);
  });

  it("accepts a line with billableToCustomerId set", () => {
    const result = billSchema.safeParse(
      baseBill({
        lines: [
          {
            name: "Reimbursable consulting",
            quantity: 1,
            rate: 500,
            billableToCustomerId: "cust-acme",
          },
        ],
      })
    );
    expect(result.success).toBe(true);
  });
});

describe("billSchema — documentTax", () => {
  it("accepts TDS", () => {
    const result = billSchema.safeParse(
      baseBill({ documentTax: { taxId: "tax-1", type: "TDS" } })
    );
    expect(result.success).toBe(true);
  });

  it("accepts TCS", () => {
    const result = billSchema.safeParse(
      baseBill({ documentTax: { taxId: "tax-1", type: "TCS" } })
    );
    expect(result.success).toBe(true);
  });

  it("rejects an unknown documentTax type", () => {
    const result = billSchema.safeParse(
      baseBill({
        documentTax: { taxId: "tax-1", type: "VAT" as unknown as "TDS" },
      })
    );
    expect(result.success).toBe(false);
  });
});

describe("billSchema — attachments cap", () => {
  it("accepts up to 10 attachments", () => {
    const tens = Array.from({ length: 10 }, (_, i) => ({
      fileName: `f${i}.pdf`,
      fileUrl: `/x/${i}`,
      fileSize: 1,
      mimeType: "application/pdf",
    }));
    const result = billSchema.safeParse(baseBill({ attachments: tens }));
    expect(result.success).toBe(true);
  });

  it("rejects 11 attachments", () => {
    const elevens = Array.from({ length: 11 }, (_, i) => ({
      fileName: `f${i}.pdf`,
      fileUrl: `/x/${i}`,
      fileSize: 1,
      mimeType: "application/pdf",
    }));
    const result = billSchema.safeParse(baseBill({ attachments: elevens }));
    expect(result.success).toBe(false);
  });
});
