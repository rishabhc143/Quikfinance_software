import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    bill: { findMany: vi.fn().mockResolvedValue([]) },
    recurringInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    recurringBill: { findMany: vi.fn().mockResolvedValue([]) },
    recurringExpense: { findMany: vi.fn().mockResolvedValue([]) },
    anomalyAlert: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/anomaly/detectors/duplicate-bill", () => ({
  detectDuplicateBills: vi.fn(),
}));

vi.mock("@/lib/anomaly/detectors/missing-recurring", () => ({
  detectMissingRecurring: vi.fn(),
}));

import { runAnomalyDetectors } from "@/lib/anomaly/run-all";
import { db } from "@/lib/db";
import { detectDuplicateBills } from "@/lib/anomaly/detectors/duplicate-bill";
import { detectMissingRecurring } from "@/lib/anomaly/detectors/missing-recurring";

const dupMock = detectDuplicateBills as unknown as ReturnType<typeof vi.fn>;
const missMock = detectMissingRecurring as unknown as ReturnType<typeof vi.fn>;
const existingFindMany = db.anomalyAlert.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const createManyMock = db.anomalyAlert.createMany as unknown as ReturnType<
  typeof vi.fn
>;

const ORG = "org-1";
const TODAY = new Date("2026-06-15");

beforeEach(() => {
  dupMock.mockReset().mockResolvedValue([]);
  missMock.mockReset().mockResolvedValue([]);
  existingFindMany.mockReset().mockResolvedValue([]);
  createManyMock.mockReset().mockResolvedValue({ count: 0 });
});

function det(
  detectorKey: string,
  fingerprint: string,
  severity: "high" | "medium" | "low" = "high"
) {
  return {
    detectorKey,
    severity,
    title: `${detectorKey} title`,
    description: `${detectorKey} desc`,
    refType: "bill",
    refId: fingerprint,
    fingerprint,
  };
}

describe("runAnomalyDetectors", () => {
  it("returns zero counts when no detectors emit anything", async () => {
    const out = await runAnomalyDetectors(ORG, TODAY);
    expect(out).toEqual({ detected: 0, inserted: 0, skipped: 0 });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("inserts all findings when none exist yet", async () => {
    dupMock.mockResolvedValue([det("duplicate_bill", "fp-1")]);
    missMock.mockResolvedValue([det("missing_recurring", "fp-2")]);
    createManyMock.mockResolvedValue({ count: 2 });

    const out = await runAnomalyDetectors(ORG, TODAY);
    expect(out.detected).toBe(2);
    expect(out.inserted).toBe(2);
    expect(out.skipped).toBe(0);
    expect(createManyMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes against existing OPEN alerts by fingerprint", async () => {
    dupMock.mockResolvedValue([
      det("duplicate_bill", "fp-1"),
      det("duplicate_bill", "fp-2"),
    ]);
    existingFindMany.mockResolvedValue([{ fingerprint: "fp-1" }]);
    createManyMock.mockResolvedValue({ count: 1 });

    const out = await runAnomalyDetectors(ORG, TODAY);
    expect(out.detected).toBe(2);
    expect(out.inserted).toBe(1);
    expect(out.skipped).toBe(1);

    // Verify only fp-2 was passed to createMany
    const callData = createManyMock.mock.calls[0][0].data;
    expect(callData).toHaveLength(1);
    expect(callData[0].fingerprint).toBe("fp-2");
  });

  it("skips createMany when every finding is already open", async () => {
    dupMock.mockResolvedValue([det("duplicate_bill", "fp-1")]);
    existingFindMany.mockResolvedValue([{ fingerprint: "fp-1" }]);

    const out = await runAnomalyDetectors(ORG, TODAY);
    expect(out.detected).toBe(1);
    expect(out.inserted).toBe(0);
    expect(out.skipped).toBe(1);
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("survives a detector that throws", async () => {
    dupMock.mockRejectedValue(new Error("boom"));
    missMock.mockResolvedValue([det("missing_recurring", "fp-2")]);
    createManyMock.mockResolvedValue({ count: 1 });

    const out = await runAnomalyDetectors(ORG, TODAY);
    // The other detector's finding still lands.
    expect(out.detected).toBe(1);
    expect(out.inserted).toBe(1);
  });

  it("calls createMany with skipDuplicates: true (belt-and-braces against races)", async () => {
    dupMock.mockResolvedValue([det("duplicate_bill", "fp-1")]);
    createManyMock.mockResolvedValue({ count: 1 });

    await runAnomalyDetectors(ORG, TODAY);
    const call = createManyMock.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
  });

  it("scopes the existing-fingerprint lookup to status='open' and the current org", async () => {
    dupMock.mockResolvedValue([det("duplicate_bill", "fp-1")]);
    createManyMock.mockResolvedValue({ count: 1 });

    await runAnomalyDetectors(ORG, TODAY);
    const lookupCall = existingFindMany.mock.calls[0][0];
    expect(lookupCall.where.organizationId).toBe(ORG);
    expect(lookupCall.where.status).toBe("open");
    expect(lookupCall.where.fingerprint).toEqual({ in: ["fp-1"] });
  });
});
