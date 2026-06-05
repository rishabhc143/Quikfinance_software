import { describe, it, expect } from "vitest";
import { aggregateDelays } from "@/lib/cashflow/payment-patterns";

const obs = (contactId: string, dueDays: number, payDays: number) => {
  // Anchor on 2026-06-01 so dueDate + delay is deterministic.
  const base = new Date("2026-06-01");
  const due = new Date(base.getTime() + dueDays * 86400000);
  const pay = new Date(base.getTime() + payDays * 86400000);
  return { contactId, dueDate: due, paymentDate: pay };
};

describe("aggregateDelays", () => {
  it("returns empty map for empty input", () => {
    expect(aggregateDelays([]).size).toBe(0);
  });

  it("ignores contacts with fewer than 3 observations", () => {
    const out = aggregateDelays([
      obs("c1", 0, 5),
      obs("c1", 10, 14), // 2 samples — should be ignored
    ]);
    expect(out.size).toBe(0);
  });

  it("computes simple average for 3+ on-time payments", () => {
    const out = aggregateDelays([
      obs("c1", 0, 5), // 5-day delay
      obs("c1", 10, 17), // 7-day delay
      obs("c1", 20, 21), // 1-day delay
    ]);
    const p = out.get("c1");
    expect(p).toBeDefined();
    expect(p!.avgDelayDays).toBe(4); // (5+7+1)/3 = 4.33 → rounded to 4
    expect(p!.sampleSize).toBe(3);
  });

  it("handles early payments as negative delays", () => {
    const out = aggregateDelays([
      obs("c1", 10, 5), // -5 days (paid 5 days early)
      obs("c1", 20, 18), // -2 days
      obs("c1", 30, 27), // -3 days
    ]);
    const p = out.get("c1")!;
    expect(p.avgDelayDays).toBe(-3); // (-5-2-3)/3 = -3.33 → -3
  });

  it("clamps outliers at ±180 days", () => {
    const out = aggregateDelays([
      obs("c1", 0, 5),
      obs("c1", 10, 17),
      obs("c1", 20, 9999), // 9979-day delay → clamped to 180
    ]);
    const p = out.get("c1")!;
    // (5 + 7 + 180) / 3 = 64
    expect(p.avgDelayDays).toBe(64);
  });

  it("clamps negative outliers at -180", () => {
    const out = aggregateDelays([
      obs("c1", 0, 5),
      obs("c1", 10, 17),
      obs("c1", 20, -1000), // way negative → clamped to -180
    ]);
    const p = out.get("c1")!;
    // (5 + 7 + (-180)) / 3 = -56
    expect(p.avgDelayDays).toBe(-56);
  });

  it("groups by contactId independently", () => {
    const out = aggregateDelays([
      obs("c1", 0, 5),
      obs("c1", 10, 17),
      obs("c1", 20, 27),
      obs("c2", 0, 0),
      obs("c2", 10, 10),
      obs("c2", 20, 20),
    ]);
    expect(out.size).toBe(2);
    expect(out.get("c1")!.avgDelayDays).toBe(6); // (5+7+7)/3 = 6.33 → 6
    expect(out.get("c2")!.avgDelayDays).toBe(0); // perfect on-time
  });

  it("handles same-day payments as zero delay", () => {
    const out = aggregateDelays([
      obs("c1", 0, 0),
      obs("c1", 10, 10),
      obs("c1", 20, 20),
    ]);
    expect(out.get("c1")!.avgDelayDays).toBe(0);
  });

  it("returns sample size accurately when above threshold", () => {
    const out = aggregateDelays(
      Array.from({ length: 10 }, (_, i) => obs("c1", i * 10, i * 10 + 5))
    );
    expect(out.get("c1")!.sampleSize).toBe(10);
    expect(out.get("c1")!.avgDelayDays).toBe(5);
  });

  it("multiple payments same contact, different delays produce correct mean", () => {
    // 4 observations: delays of 1, 3, 5, 7. Mean = 4.
    const out = aggregateDelays([
      obs("c1", 0, 1),
      obs("c1", 10, 13),
      obs("c1", 20, 25),
      obs("c1", 30, 37),
    ]);
    expect(out.get("c1")!.avgDelayDays).toBe(4);
  });
});
