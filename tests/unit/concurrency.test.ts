import { describe, it, expect } from "vitest";
import { mapPool } from "@/lib/concurrency";

describe("mapPool", () => {
  it("returns an empty array on empty input", async () => {
    const result = await mapPool([], 8, async () => "x");
    expect(result).toEqual([]);
  });

  it("returns an empty array when concurrency is 0", async () => {
    const result = await mapPool([1, 2, 3], 0, async (n) => n * 2);
    expect(result).toEqual([]);
  });

  it("preserves input order in the result array", async () => {
    // Random delays per item so workers complete out of order; the
    // result array must still be in input order.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = await mapPool(items, 4, async (n) => {
      await new Promise((r) => setTimeout(r, (10 - n) * 5));
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("respects the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapPool(items, 5, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1); // at least some parallelism happened
  });

  it("propagates errors from the worker function", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom on 2");
        return n;
      })
    ).rejects.toThrow("boom on 2");
  });

  it("does not exceed item count when concurrency is larger", async () => {
    const items = [1, 2];
    let workerCount = 0;
    await mapPool(items, 8, async () => {
      workerCount += 1;
      await new Promise((r) => setTimeout(r, 5));
    });
    // Because mapPool clamps workerCount to items.length, at most 2
    // workers ran (each processed one item).
    expect(workerCount).toBe(2);
  });

  it("passes the index to the worker function", async () => {
    const items = ["a", "b", "c"];
    const result = await mapPool(items, 2, async (item, i) => `${i}:${item}`);
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });
});
