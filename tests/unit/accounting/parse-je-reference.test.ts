import { describe, it, expect } from "vitest";
import {
  parseJeReference,
  isStructuredJeReference,
} from "@/lib/accounting/parse-je-reference";

/**
 * Tests for the JE reference parser. The structured keys are written
 * by lib/accounting/post-domain-je.ts (and the BNK-D applyCategorise
 * helper writes free-text refs we should NOT match).
 */

describe("parseJeReference — single-id keys", () => {
  it("INV-SENT:<id> → invoice link", () => {
    const r = parseJeReference("INV-SENT:cm0abc");
    expect(r).toEqual({
      kind: "INVOICE_SENT",
      label: "Invoice sent",
      sourceId: "cm0abc",
      sourceHref: "/sales/invoices/cm0abc",
    });
  });

  it("BILL-OPEN → bill link", () => {
    expect(parseJeReference("BILL-OPEN:cm123")?.sourceHref).toBe("/purchases/bills/cm123");
  });

  it("CN-OPEN → credit-note link", () => {
    expect(parseJeReference("CN-OPEN:cm456")?.sourceHref).toBe("/sales/credit-notes/cm456");
  });

  it("VC-OPEN → vendor-credit link", () => {
    expect(parseJeReference("VC-OPEN:cm789")?.sourceHref).toBe("/purchases/vendor-credits/cm789");
  });

  it("INV-WRITEOFF → invoice link", () => {
    const r = parseJeReference("INV-WRITEOFF:cm0xy");
    expect(r?.kind).toBe("INVOICE_WRITEOFF");
    expect(r?.sourceHref).toBe("/sales/invoices/cm0xy");
  });

  it("VA-CREATE → payment-made link", () => {
    const r = parseJeReference("VA-CREATE:cm-pay");
    expect(r?.kind).toBe("VENDOR_ADVANCE");
    expect(r?.sourceHref).toBe("/purchases/payments-made/cm-pay");
  });
});

describe("parseJeReference — two-id keys link to the parent record", () => {
  it("INV-PMT:<paymentId>:<invoiceId> → invoice link", () => {
    const r = parseJeReference("INV-PMT:cmPay:cmInv");
    expect(r?.sourceId).toBe("cmInv");
    expect(r?.sourceHref).toBe("/sales/invoices/cmInv");
  });

  it("BILL-PMT:<paymentId>:<billId> → bill link", () => {
    const r = parseJeReference("BILL-PMT:cmPay:cmBill");
    expect(r?.sourceId).toBe("cmBill");
    expect(r?.sourceHref).toBe("/purchases/bills/cmBill");
  });

  it("BILL-PMT-ADV resolves to its own label (not BILL-PMT)", () => {
    const r = parseJeReference("BILL-PMT-ADV:cmPay:cmBill");
    expect(r?.kind).toBe("BILL_PAYMENT_ADVANCE");
    expect(r?.label).toMatch(/advance/i);
    expect(r?.sourceHref).toBe("/purchases/bills/cmBill");
  });

  it("CN-REFUND:<cnId>:<refundId> → credit-note link to the parent CN", () => {
    const r = parseJeReference("CN-REFUND:cmCn:cmRef");
    // First segment is the CN id; refund id is the second.
    expect(r?.sourceId).toBe("cmCn");
    expect(r?.sourceHref).toBe("/sales/credit-notes/cmCn");
  });

  it("VC-REFUND:<vcId>:<refundId> → vendor-credit link", () => {
    const r = parseJeReference("VC-REFUND:cmVc:cmRef");
    expect(r?.sourceId).toBe("cmVc");
    expect(r?.sourceHref).toBe("/purchases/vendor-credits/cmVc");
  });
});

describe("parseJeReference — falsy / unstructured input", () => {
  it("null returns null", () => {
    expect(parseJeReference(null)).toBeNull();
  });

  it("undefined returns null", () => {
    expect(parseJeReference(undefined)).toBeNull();
  });

  it("empty string returns null", () => {
    expect(parseJeReference("")).toBeNull();
  });

  it("free-text manual reference returns null", () => {
    expect(parseJeReference("Adjusting entry — Q1")).toBeNull();
  });

  it("partial prefix without id returns null", () => {
    expect(parseJeReference("INV-SENT:")).toBeNull();
  });

  it("unknown prefix returns null", () => {
    expect(parseJeReference("FOO-BAR:cm123")).toBeNull();
  });
});

describe("isStructuredJeReference", () => {
  it("returns true for any structured key", () => {
    expect(isStructuredJeReference("INV-SENT:cm1")).toBe(true);
    expect(isStructuredJeReference("BILL-PMT-ADV:a:b")).toBe(true);
  });
  it("returns false for free-text + null", () => {
    expect(isStructuredJeReference(null)).toBe(false);
    expect(isStructuredJeReference("Quarterly adjustment")).toBe(false);
  });
});
