import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  _cacheSizeForTests,
  _clearCacheForTests,
  getCachedToolResult,
  setCachedToolResult,
} from "@/lib/llm/cache";

beforeEach(() => _clearCacheForTests());
afterEach(() => vi.useRealTimers());

describe("response cache", () => {
  it("returns undefined for a miss", () => {
    expect(getCachedToolResult("org-1", "get_x", { a: 1 })).toBeUndefined();
  });

  it("returns the stored value on hit", () => {
    setCachedToolResult("org-1", "get_x", { a: 1 }, { result: "yes" });
    expect(getCachedToolResult("org-1", "get_x", { a: 1 })).toEqual({ result: "yes" });
  });

  it("isolates by org (no cross-tenant leakage)", () => {
    setCachedToolResult("org-1", "get_x", { a: 1 }, { tenant: 1 });
    expect(getCachedToolResult("org-2", "get_x", { a: 1 })).toBeUndefined();
  });

  it("isolates by tool name", () => {
    setCachedToolResult("org-1", "get_x", { a: 1 }, { x: 1 });
    expect(getCachedToolResult("org-1", "get_y", { a: 1 })).toBeUndefined();
  });

  it("is order-invariant in the input object's keys", () => {
    setCachedToolResult("org-1", "get_x", { a: 1, b: 2 }, "first");
    // Same logical input but keys in a different order — should hit.
    expect(getCachedToolResult("org-1", "get_x", { b: 2, a: 1 })).toBe("first");
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00Z"));
    setCachedToolResult("org-1", "get_x", { a: 1 }, "fresh", 1000); // 1s TTL
    expect(getCachedToolResult("org-1", "get_x", { a: 1 })).toBe("fresh");
    vi.setSystemTime(new Date("2026-06-10T10:00:02Z")); // 2s later
    expect(getCachedToolResult("org-1", "get_x", { a: 1 })).toBeUndefined();
  });

  it("evicts oldest entries when over the 200-entry cap", () => {
    for (let i = 0; i < 250; i += 1) {
      setCachedToolResult("org-1", "get_x", { i }, i);
    }
    expect(_cacheSizeForTests()).toBeLessThanOrEqual(200);
    // The very first entry should have been evicted.
    expect(getCachedToolResult("org-1", "get_x", { i: 0 })).toBeUndefined();
    // The most recent should still be there.
    expect(getCachedToolResult("org-1", "get_x", { i: 249 })).toBe(249);
  });
});
