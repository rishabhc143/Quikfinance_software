import { describe, it, expect } from "vitest";
import {
  ledgerToCreateInput,
  voucherToCreateInput,
  indexVouchersByPartyGuid,
} from "@/lib/migration/mapper";
import type { CanonicalLedger, CanonicalVoucher } from "@/lib/migration/canonical";

const ORG = "org-1";
const BATCH = "batch-1";

function canonicalLedger(over: Partial<CanonicalLedger> = {}): CanonicalLedger {
  return {
    sourceFormat: "tally-prime",
    sourceGuid: "ledger:acme corp",
    displayName: "Acme Corp",
    kind: "customer",
    groupPath: "Sundry Debtors",
    gstin: "29ABCDE1234F1Z5",
    stateCode: "Karnataka",
    openingBalance: -150000,
    raw: {},
    ...over,
  };
}

function canonicalVoucher(over: Partial<CanonicalVoucher> = {}): CanonicalVoucher {
  return {
    sourceFormat: "tally-prime",
    sourceGuid: "vch-001",
    sourceVoucherNumber: "INV-001",
    type: "sales",
    date: "2024-05-15",
    partyRef: {
      sourceGuid: "ledger:acme corp",
      displayName: "Acme Corp",
      gstin: "29ABCDE1234F1Z5",
    },
    lines: [
      { itemName: "Consulting", amount: 50000, taxAmount: 9000, taxRate: 18, raw: {} },
    ],
    totals: { subtotal: 50000, tax: 9000, total: 59000 },
    raw: {},
    ...over,
  };
}

describe("ledgerToCreateInput", () => {
  it("produces a Prisma createMany row with all canonical fields mapped", () => {
    const out = ledgerToCreateInput(canonicalLedger(), ORG, BATCH);
    expect(out.organizationId).toBe(ORG);
    expect(out.migrationBatchId).toBe(BATCH);
    expect(out.sourceFormat).toBe("tally-prime");
    expect(out.sourceGuid).toBe("ledger:acme corp");
    expect(out.kind).toBe("customer");
    expect(out.displayName).toBe("Acme Corp");
    expect(out.gstin).toBe("29ABCDE1234F1Z5");
    expect(out.openingBalance).toBe("-150000");
  });

  it("nulls optional fields when canonical has them undefined", () => {
    const out = ledgerToCreateInput(
      canonicalLedger({
        gstin: undefined,
        stateCode: undefined,
        address: undefined,
        phone: undefined,
        email: undefined,
        openingBalance: undefined,
      }),
      ORG,
      BATCH
    );
    expect(out.gstin).toBeNull();
    expect(out.stateCode).toBeNull();
    expect(out.openingBalance).toBeNull();
  });
});

describe("voucherToCreateInput", () => {
  it("maps a sales voucher with totals + lines", () => {
    const out = voucherToCreateInput(canonicalVoucher(), ORG, BATCH);
    expect(out.organizationId).toBe(ORG);
    expect(out.type).toBe("sales");
    expect(out.sourceVoucherNumber).toBe("INV-001");
    expect(out.subtotal).toBe("50000");
    expect(out.tax).toBe("9000");
    expect(out.total).toBe("59000");
  });

  it("leaves partyLedgerId null at insert time (resolved post-insert)", () => {
    const out = voucherToCreateInput(canonicalVoucher(), ORG, BATCH);
    expect(out.partyLedgerId).toBeNull();
  });

  it("converts ISO date string to a Date object", () => {
    const out = voucherToCreateInput(canonicalVoucher(), ORG, BATCH);
    expect(out.date).toBeInstanceOf(Date);
    expect((out.date as Date).toISOString().slice(0, 10)).toBe("2024-05-15");
  });

  it("strips raw payload from each line but keeps analytic fields", () => {
    const lines = (
      voucherToCreateInput(canonicalVoucher(), ORG, BATCH).lines as unknown as {
        itemName: string;
        amount: number;
        taxAmount: number;
      }[]
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].itemName).toBe("Consulting");
    expect(lines[0].amount).toBe(50000);
    expect(lines[0].taxAmount).toBe(9000);
    // `raw` should NOT be in the serialised line
    expect((lines[0] as unknown as Record<string, unknown>).raw).toBeUndefined();
  });
});

describe("indexVouchersByPartyGuid", () => {
  it("groups vouchers by their party's sourceGuid", () => {
    const a = canonicalVoucher({ sourceGuid: "v1" });
    const b = canonicalVoucher({ sourceGuid: "v2" });
    const c = canonicalVoucher({
      sourceGuid: "v3",
      partyRef: { sourceGuid: "ledger:beta corp", displayName: "Beta Corp" },
    });
    const map = indexVouchersByPartyGuid([a, b, c]);
    expect(map.size).toBe(2);
    expect(map.get("ledger:acme corp")?.length).toBe(2);
    expect(map.get("ledger:beta corp")?.length).toBe(1);
  });

  it("ignores vouchers without partyRef", () => {
    const orphan = canonicalVoucher({ sourceGuid: "v-orphan", partyRef: undefined });
    const map = indexVouchersByPartyGuid([orphan]);
    expect(map.size).toBe(0);
  });
});
