import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache BEFORE importing the module under test so the
// mocked function is what `lib/revalidate.ts` binds to.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { revalidatePaths } from "@/lib/revalidate";

describe("revalidatePaths", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("calls revalidatePath once per provided path", () => {
    revalidatePaths("/a", "/b", "/c");
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/a");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/b");
    expect(revalidatePath).toHaveBeenNthCalledWith(3, "/c");
  });

  it("does nothing when called with zero paths", () => {
    revalidatePaths();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("handles the two-path common case (sales/invoices pattern)", () => {
    const id = "inv-123";
    revalidatePaths("/sales/invoices", `/sales/invoices/${id}`);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/sales/invoices");
    expect(revalidatePath).toHaveBeenNthCalledWith(
      2,
      "/sales/invoices/inv-123"
    );
  });

  it("preserves path order (matters for cache invalidation semantics)", () => {
    revalidatePaths("/z", "/a", "/m");
    const calls = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["/z", "/a", "/m"]);
  });

  it("works with template-literal path strings", () => {
    const orgId = "org-1";
    revalidatePaths(`/reports?org=${orgId}`, `/dashboard?org=${orgId}`);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });
});
