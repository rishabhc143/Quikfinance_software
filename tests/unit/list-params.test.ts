import { describe, it, expect } from "vitest";
import { parseListSearchParams } from "@/lib/list-params";

describe("parseListSearchParams", () => {
  it("returns defaults when searchParams is empty", () => {
    const out = parseListSearchParams({}, { defaultSort: "issueDate" });
    expect(out).toEqual({
      q: "",
      page: 1,
      pageSize: 25,
      sort: "issueDate",
      dir: "desc",
    });
  });

  it("trims the q parameter", () => {
    expect(parseListSearchParams({ q: "  hello  " }, { defaultSort: "x" }).q).toBe(
      "hello"
    );
  });

  it("clamps page to at least 1", () => {
    expect(parseListSearchParams({ page: "0" }, { defaultSort: "x" }).page).toBe(1);
    expect(parseListSearchParams({ page: "-5" }, { defaultSort: "x" }).page).toBe(1);
    expect(parseListSearchParams({ page: "3" }, { defaultSort: "x" }).page).toBe(3);
  });

  it("respects defaultPageSize override", () => {
    expect(
      parseListSearchParams({}, { defaultSort: "x", defaultPageSize: 50 }).pageSize
    ).toBe(50);
  });

  it("URL pageSize takes precedence over default", () => {
    expect(
      parseListSearchParams(
        { pageSize: "100" },
        { defaultSort: "x", defaultPageSize: 25 }
      ).pageSize
    ).toBe(100);
  });

  it("sort URL param takes precedence over defaultSort", () => {
    const out = parseListSearchParams({ sort: "total" }, { defaultSort: "issueDate" });
    expect(out.sort).toBe("total");
  });

  describe("dir with defaultDir='desc' (most list pages)", () => {
    it("URL ?dir=asc flips to asc", () => {
      expect(
        parseListSearchParams({ dir: "asc" }, { defaultSort: "x", defaultDir: "desc" })
          .dir
      ).toBe("asc");
    });

    it("URL ?dir=desc keeps desc", () => {
      expect(
        parseListSearchParams({ dir: "desc" }, { defaultSort: "x", defaultDir: "desc" })
          .dir
      ).toBe("desc");
    });

    it("garbage dir param keeps default desc", () => {
      expect(
        parseListSearchParams(
          { dir: "garbage" },
          { defaultSort: "x", defaultDir: "desc" }
        ).dir
      ).toBe("desc");
    });

    it("no dir param keeps default desc", () => {
      expect(
        parseListSearchParams({}, { defaultSort: "x", defaultDir: "desc" }).dir
      ).toBe("desc");
    });
  });

  describe("dir with defaultDir='asc' (customers/vendors)", () => {
    it("URL ?dir=desc flips to desc", () => {
      expect(
        parseListSearchParams({ dir: "desc" }, { defaultSort: "x", defaultDir: "asc" })
          .dir
      ).toBe("desc");
    });

    it("URL ?dir=asc keeps asc", () => {
      expect(
        parseListSearchParams({ dir: "asc" }, { defaultSort: "x", defaultDir: "asc" })
          .dir
      ).toBe("asc");
    });

    it("garbage dir param keeps default asc", () => {
      expect(
        parseListSearchParams(
          { dir: "garbage" },
          { defaultSort: "x", defaultDir: "asc" }
        ).dir
      ).toBe("asc");
    });
  });

  it("handles array-valued query strings by picking first element", () => {
    expect(
      parseListSearchParams({ q: ["first", "second"] }, { defaultSort: "x" }).q
    ).toBe("first");
  });

  it("undefined defaultDir falls back to 'desc'", () => {
    expect(parseListSearchParams({}, { defaultSort: "x" }).dir).toBe("desc");
  });
});
