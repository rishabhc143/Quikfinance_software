/**
 * Audit r2 R2-7: shared parser for the list-page `searchParams` block
 * that 17 dashboard list pages copy-paste:
 *
 *   const q = searchParams.q?.trim() ?? "";
 *   const page = Math.max(1, Number(searchParams.page ?? "1"));
 *   const pageSize = Number(searchParams.pageSize ?? 25);
 *   const sort = searchParams.sort ?? "issueDate";
 *   const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
 *
 * The only per-page variations are:
 *   - `defaultSort` field name (issueDate, displayName, date, etc.)
 *   - `defaultDir` (most pages default desc; customers/vendors default asc)
 *   - `defaultPageSize` (always 25 in current callers; kept parameterised
 *     for future override)
 *
 * The helper returns the same 5 names (`q`, `page`, `pageSize`, `sort`,
 * `dir`) so the call-site swap is literal:
 *
 *   // before
 *   const q = searchParams.q?.trim() ?? "";
 *   const page = Math.max(1, Number(searchParams.page ?? "1"));
 *   const pageSize = Number(searchParams.pageSize ?? 25);
 *   const sort = searchParams.sort ?? "issueDate";
 *   const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
 *
 *   // after
 *   const { q, page, pageSize, sort, dir } = parseListSearchParams(
 *     searchParams,
 *     { defaultSort: "issueDate" }
 *   );
 *
 * The `defaultDir` direction logic preserves the "default to X unless URL
 * explicitly says the other" semantics of every caller — when defaultDir
 * is "desc" (most pages), only `?dir=asc` flips to asc; anything else
 * (no param, garbage value) stays desc. When defaultDir is "asc"
 * (customers/vendors), only `?dir=desc` flips. This matches the
 * pre-refactor behaviour byte-for-byte.
 */

export type ListSearchParams = Record<string, string | string[] | undefined>;

export type ParsedListParams = {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
};

/**
 * Note on the `sort` return type: it's `string` (not a generic literal)
 * because every caller compares the value against multiple option
 * strings in its where-clause / orderBy builder, e.g.
 * `sort === "total" ? ... : sort === "dueDate" ? ...`. Narrowing `sort`
 * to the literal default ("issueDate") would make those comparisons
 * TS-error as "no overlap." Callers retain the literal type of
 * `defaultSort` only for documentation; runtime is plain string.
 */
export function parseListSearchParams(
  searchParams: ListSearchParams,
  opts: {
    defaultSort: string;
    /** Default sort direction. Most list pages default to "desc"
     *  (most recent first); customers/vendors default to "asc"
     *  (alphabetical). */
    defaultDir?: "asc" | "desc";
    /** Default rows per page. All current callers use 25. */
    defaultPageSize?: number;
  }
): ParsedListParams {
  const defaultDir = opts.defaultDir ?? "desc";
  const defaultPageSize = opts.defaultPageSize ?? 25;

  const raw = (key: string): string | undefined => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };

  return {
    q: (raw("q") ?? "").trim(),
    page: Math.max(1, Number(raw("page") ?? "1")),
    pageSize: Number(raw("pageSize") ?? defaultPageSize),
    sort: raw("sort") ?? opts.defaultSort,
    dir:
      defaultDir === "asc"
        ? raw("dir") === "desc"
          ? "desc"
          : "asc"
        : raw("dir") === "asc"
          ? "asc"
          : "desc",
  };
}
