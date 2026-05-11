import { db } from "@/lib/db";

/**
 * M17d: SavedView helpers.
 *
 * Per the Invoices Refinement Patch addendum, every Sales list page's
 * chevron-dropdown is powered by the SavedView table. System views are
 * seeded on first read (lazy seeding — avoids a migration step). User
 * custom views are out of scope for this batch (filter-builder modal
 * is a follow-up); seeded system views fully match the existing
 * hardcoded view options.
 *
 * filterJson shape:
 *   { kind: "all" }
 *   { kind: "status", value: <single | string[]> }
 *   { kind: "boolean", field: string, value: boolean }
 */

export type SavedViewModule =
  | "invoices"
  | "quotes"
  | "sales_orders"
  | "delivery_challans"
  | "credit_notes"
  | "payments_received"
  | "recurring_invoices"
  | "customers";

/**
 * filterJson schema.
 *
 * v1 (M17a) only supported `all` / `status` / `boolean`. v2 adds
 * date-range / amount-range / customer multi-select and a top-level
 * `and` combinator so users can compose them.
 */
export type FilterJson =
  | { kind: "all" }
  | { kind: "status"; value: string | string[] }
  | { kind: "boolean"; field: string; value: boolean }
  | { kind: "dateRange"; field: string; from?: string; to?: string }
  | { kind: "amountRange"; field: string; min?: number; max?: number }
  | { kind: "customer"; ids: string[] }
  | { kind: "and"; filters: FilterJson[] };

type SystemView = {
  slug: string;
  label: string;
  filter: FilterJson;
  isDefault?: boolean;
};

/**
 * Canonical system views per module — must mirror what was previously
 * hardcoded on each list page.
 */
const SYSTEM_VIEWS: Record<SavedViewModule, SystemView[]> = {
  invoices: [
    { slug: "all", label: "All", filter: { kind: "all" } },
    {
      slug: "unpaid",
      label: "Unpaid",
      filter: {
        kind: "status",
        value: ["SENT", "PARTIALLY_PAID", "OVERDUE"],
      },
      isDefault: true,
    },
    { slug: "draft", label: "Draft", filter: { kind: "status", value: "DRAFT" } },
    { slug: "sent", label: "Sent", filter: { kind: "status", value: "SENT" } },
    {
      slug: "overdue",
      label: "Overdue",
      filter: { kind: "status", value: "OVERDUE" },
    },
    { slug: "paid", label: "Paid", filter: { kind: "status", value: "PAID" } },
    { slug: "void", label: "Void", filter: { kind: "status", value: "VOID" } },
    {
      slug: "partially_paid",
      label: "Partially Paid",
      filter: { kind: "status", value: "PARTIALLY_PAID" },
    },
  ],
  quotes: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
    { slug: "draft", label: "Draft", filter: { kind: "status", value: "DRAFT" } },
    { slug: "sent", label: "Sent", filter: { kind: "status", value: "SENT" } },
    {
      slug: "accepted",
      label: "Accepted",
      filter: { kind: "status", value: "ACCEPTED" },
    },
    {
      slug: "declined",
      label: "Declined",
      filter: { kind: "status", value: "DECLINED" },
    },
    {
      slug: "expired",
      label: "Expired",
      filter: { kind: "status", value: "EXPIRED" },
    },
    {
      slug: "invoiced",
      label: "Invoiced",
      filter: { kind: "status", value: "INVOICED" },
    },
  ],
  sales_orders: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
    { slug: "draft", label: "Draft", filter: { kind: "status", value: "DRAFT" } },
    {
      slug: "confirmed",
      label: "Confirmed",
      filter: { kind: "status", value: "CONFIRMED" },
    },
    {
      slug: "closed",
      label: "Closed",
      filter: { kind: "status", value: "CLOSED" },
    },
    { slug: "void", label: "Void", filter: { kind: "status", value: "VOID" } },
  ],
  delivery_challans: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
  ],
  credit_notes: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
  ],
  payments_received: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
  ],
  recurring_invoices: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
  ],
  customers: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
    {
      slug: "active",
      label: "Active",
      filter: { kind: "boolean", field: "isInactive", value: false },
    },
    {
      slug: "inactive",
      label: "Inactive",
      filter: { kind: "boolean", field: "isInactive", value: true },
    },
    {
      slug: "portal_enabled",
      label: "Portal-enabled",
      filter: { kind: "boolean", field: "enablePortal", value: true },
    },
  ],
};

/**
 * Returns ordered SavedView rows for the given (org × module). System
 * views are auto-seeded on first read (one INSERT … ON CONFLICT DO
 * NOTHING per missing row).
 */
export async function getSavedViews(
  organizationId: string,
  module: SavedViewModule
): Promise<
  {
    id: string;
    slug: string;
    label: string;
    isSystem: boolean;
    isDefault: boolean;
    filter: FilterJson;
  }[]
> {
  const seeded = SYSTEM_VIEWS[module] ?? [];

  // Lazy-seed system rows that don't exist yet for this org+module.
  // The migration created the SavedView table without seeded data, so
  // the first read on any new org triggers this.
  const existing = await db.savedView.findMany({
    where: { organizationId, module, isSystem: true },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((v) => v.name));
  const missing = seeded.filter((v) => !existingNames.has(v.slug));
  if (missing.length > 0) {
    await db.savedView.createMany({
      data: missing.map((v, i) => ({
        organizationId,
        module,
        name: v.slug,
        isSystem: true,
        isDefault: !!v.isDefault,
        position: i,
        filterJson: v.filter as object,
      })),
      skipDuplicates: true,
    });
  }

  const rows = await db.savedView.findMany({
    where: { organizationId, module },
    orderBy: [
      { isSystem: "desc" }, // system views first
      { position: "asc" },
      { name: "asc" },
    ],
  });

  return rows.map((r) => {
    const sys = seeded.find((s) => s.slug === r.name);
    return {
      id: r.id,
      slug: r.name,
      label: sys?.label ?? r.name,
      isSystem: r.isSystem,
      isDefault: r.isDefault,
      filter: r.filterJson as FilterJson,
    };
  });
}

/**
 * Translate a SavedView's filterJson into a Prisma where-clause
 * fragment scoped to the given module's table. Returns an empty object
 * for "all" so callers can spread it into their existing where.
 *
 * Date-range expects ISO strings (YYYY-MM-DD or full ISO timestamp);
 * we coerce to Date. Amount-range expects numbers. Customer expects
 * Contact ids and filters on `contactId`.
 */
export function whereForFilter(filter: FilterJson): Record<string, unknown> {
  switch (filter.kind) {
    case "all":
      return {};
    case "status":
      return Array.isArray(filter.value)
        ? { status: { in: filter.value } }
        : { status: filter.value };
    case "boolean":
      return { [filter.field]: filter.value };
    case "dateRange": {
      const range: Record<string, Date> = {};
      if (filter.from) range.gte = new Date(filter.from);
      if (filter.to) {
        // Inclusive: treat YYYY-MM-DD as end-of-day so a single-day
        // range matches anything that day. Full ISO strings pass
        // through unchanged.
        const d = new Date(filter.to);
        if (filter.to.length === 10) {
          d.setUTCHours(23, 59, 59, 999);
        }
        range.lte = d;
      }
      return Object.keys(range).length > 0
        ? { [filter.field]: range }
        : {};
    }
    case "amountRange": {
      const range: Record<string, number> = {};
      if (typeof filter.min === "number") range.gte = filter.min;
      if (typeof filter.max === "number") range.lte = filter.max;
      return Object.keys(range).length > 0
        ? { [filter.field]: range }
        : {};
    }
    case "customer":
      if (!filter.ids || filter.ids.length === 0) return {};
      return { contactId: { in: filter.ids } };
    case "and": {
      const parts = filter.filters
        .map((f) => whereForFilter(f))
        .filter((p) => Object.keys(p).length > 0);
      if (parts.length === 0) return {};
      if (parts.length === 1) return parts[0];
      return { AND: parts };
    }
    default:
      return {};
  }
}

/** Resolve the active view by slug, or fall back to the org's default. */
export function resolveActiveView<
  T extends { slug: string; isDefault: boolean },
>(views: T[], requestedSlug?: string): T | undefined {
  if (requestedSlug) {
    const found = views.find((v) => v.slug === requestedSlug);
    if (found) return found;
  }
  return views.find((v) => v.isDefault) ?? views[0];
}
