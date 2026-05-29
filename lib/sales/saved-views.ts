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
  | "customers"
  // Purchases
  | "vendors"
  | "purchase_orders"
  | "bills"
  | "payments_made"
  | "vendor_credits"
  | "recurring_bills"
  | "recurring_expenses"
  | "expenses";

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
  // ===== Purchases module saved views =====
  vendors: [
    { slug: "all", label: "All", filter: { kind: "all" } },
    {
      slug: "active",
      label: "Active",
      filter: { kind: "boolean", field: "isInactive", value: false },
      isDefault: true,
    },
    {
      slug: "inactive",
      label: "Inactive",
      filter: { kind: "boolean", field: "isInactive", value: true },
    },
    {
      slug: "portal_enabled",
      label: "Customer Portal Enabled",
      filter: { kind: "boolean", field: "enableVendorPortal", value: true },
    },
  ],
  purchase_orders: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
    { slug: "draft", label: "Draft", filter: { kind: "status", value: "DRAFT" } },
    { slug: "issued", label: "Issued", filter: { kind: "status", value: "ISSUED" } },
    {
      slug: "partially_billed",
      label: "Partially Billed",
      filter: { kind: "status", value: "PARTIALLY_BILLED" },
    },
    { slug: "billed", label: "Billed", filter: { kind: "status", value: "BILLED" } },
    { slug: "closed", label: "Closed", filter: { kind: "status", value: "CLOSED" } },
    {
      slug: "cancelled",
      label: "Cancelled",
      filter: { kind: "status", value: "CANCELLED" },
    },
  ],
  bills: [
    { slug: "all", label: "All", filter: { kind: "all" } },
    { slug: "draft", label: "Draft", filter: { kind: "status", value: "DRAFT" } },
    {
      slug: "unpaid",
      label: "Unpaid",
      filter: { kind: "status", value: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
      isDefault: true,
    },
    { slug: "open", label: "Open", filter: { kind: "status", value: "OPEN" } },
    { slug: "overdue", label: "Overdue", filter: { kind: "status", value: "OVERDUE" } },
    { slug: "paid", label: "Paid", filter: { kind: "status", value: "PAID" } },
    { slug: "void", label: "Void", filter: { kind: "status", value: "VOID" } },
  ],
  payments_made: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
  ],
  vendor_credits: [
    {
      slug: "all",
      label: "All Vendor Credits",
      filter: { kind: "all" },
      isDefault: true,
    },
    { slug: "open", label: "Open", filter: { kind: "status", value: "OPEN" } },
    { slug: "closed", label: "Closed", filter: { kind: "status", value: "CLOSED" } },
    { slug: "void", label: "Void", filter: { kind: "status", value: "VOID" } },
  ],
  recurring_bills: [
    { slug: "all", label: "All", filter: { kind: "all" }, isDefault: true },
    { slug: "active", label: "Active", filter: { kind: "status", value: "ACTIVE" } },
    { slug: "paused", label: "Paused", filter: { kind: "status", value: "PAUSED" } },
    {
      slug: "expired",
      label: "Expired",
      filter: { kind: "status", value: "EXPIRED" },
    },
    {
      slug: "stopped",
      label: "Stopped",
      filter: { kind: "status", value: "STOPPED" },
    },
  ],
  recurring_expenses: [
    {
      slug: "all",
      label: "All Profiles",
      filter: { kind: "all" },
      isDefault: true,
    },
    { slug: "active", label: "Active", filter: { kind: "status", value: "ACTIVE" } },
    { slug: "paused", label: "Paused", filter: { kind: "status", value: "PAUSED" } },
    {
      slug: "expired",
      label: "Expired",
      filter: { kind: "status", value: "EXPIRED" },
    },
    {
      slug: "stopped",
      label: "Stopped",
      filter: { kind: "status", value: "STOPPED" },
    },
  ],
  expenses: [
    { slug: "all", label: "All", filter: { kind: "all" } },
    {
      slug: "unbilled",
      label: "Unbilled",
      filter: {
        kind: "and",
        filters: [
          { kind: "boolean", field: "isBillable", value: true },
          { kind: "boolean", field: "isBilled", value: false },
        ],
      },
      isDefault: true,
    },
    {
      slug: "billed",
      label: "Billed",
      filter: { kind: "boolean", field: "isBilled", value: true },
    },
    {
      slug: "non_billable",
      label: "Non-Billable",
      filter: { kind: "boolean", field: "isBillable", value: false },
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

  // Lazy-seed system rows. We used to do a "findMany (existing) → diff →
  // createMany (missing)" dance, but `createMany({ skipDuplicates: true })`
  // is idempotent on the unique key — INSERTs that conflict simply no-op.
  // Skipping the existence-check saves a full Prisma round trip on every
  // page load (this function fires on most list pages: Invoices, Bills,
  // Customers, Vendors, Quotes…), which is one of the biggest contributors
  // to the 5-6s-per-nav perf issue tracked in fix/dashboard-nav-perf.
  if (seeded.length > 0) {
    await db.savedView.createMany({
      data: seeded.map((v, i) => ({
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
