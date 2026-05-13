/**
 * ACCT-B — Bulk Update config + value coercion.
 *
 * Pure module. The wizard reads this to render fields; the server
 * action reads it to validate (single source of truth for which
 * (category × field) pairs are allowed).
 *
 * No DB access, no NextAuth — testable in Vitest without alias stubs.
 */

export type BulkUpdateCategory = "ITEMS" | "CUSTOMERS" | "VENDORS";

export type BulkUpdateFieldKey =
  | "sellingPrice"
  | "costPrice"
  | "taxId"
  | "isActive"
  | "paymentTermsId"
  | "currency"
  | "isInactive";

export type BulkUpdateInputType = "number" | "text" | "select" | "boolean";

export type BulkUpdateField = {
  key: BulkUpdateFieldKey;
  label: string;
  inputType: BulkUpdateInputType;
  /** For "select", the page loader populates options keyed by this name. */
  optionsKey?: "TAXES" | "PAYMENT_TERMS";
  /** Min/max for number fields. */
  min?: number;
  max?: number;
  /** Human note shown beneath the input. */
  hint?: string;
};

export const BULK_UPDATE_FIELDS: Record<BulkUpdateCategory, BulkUpdateField[]> = {
  ITEMS: [
    {
      key: "sellingPrice",
      label: "Selling Price",
      inputType: "number",
      min: 0,
      hint: "Overwrites the existing selling price on every selected item.",
    },
    {
      key: "costPrice",
      label: "Cost Price",
      inputType: "number",
      min: 0,
      hint: "Overwrites the existing cost price on every selected item.",
    },
    {
      key: "taxId",
      label: "Tax",
      inputType: "select",
      optionsKey: "TAXES",
      hint: "Reassigns the default tax for every selected item.",
    },
    {
      key: "isActive",
      label: "Active",
      inputType: "boolean",
      hint: "Marks every selected item active or inactive.",
    },
  ],
  CUSTOMERS: [
    {
      key: "paymentTermsId",
      label: "Payment Terms",
      inputType: "select",
      optionsKey: "PAYMENT_TERMS",
      hint: "Reassigns the default payment terms for every selected customer.",
    },
    {
      key: "currency",
      label: "Currency",
      inputType: "text",
      hint: "Three-letter ISO code (e.g. INR, USD).",
    },
    {
      key: "isInactive",
      label: "Inactive",
      inputType: "boolean",
      hint: "Marks every selected customer active or inactive.",
    },
  ],
  VENDORS: [
    {
      key: "paymentTermsId",
      label: "Payment Terms",
      inputType: "select",
      optionsKey: "PAYMENT_TERMS",
      hint: "Reassigns the default payment terms for every selected vendor.",
    },
    {
      key: "currency",
      label: "Currency",
      inputType: "text",
      hint: "Three-letter ISO code (e.g. INR, USD).",
    },
    {
      key: "isInactive",
      label: "Inactive",
      inputType: "boolean",
      hint: "Marks every selected vendor active or inactive.",
    },
  ],
};

/** Look up a field config; null when (category, field) isn't whitelisted. */
export function findField(
  category: BulkUpdateCategory,
  fieldKey: string
): BulkUpdateField | null {
  const list = BULK_UPDATE_FIELDS[category];
  if (!list) return null;
  return list.find((f) => f.key === fieldKey) ?? null;
}

/**
 * Coerce a raw value (from the wizard's typed input or a form submit)
 * to the right shape for the chosen field. Returns either the coerced
 * value (could be null when allowed) or an `error` message.
 *
 *   number  → Number(raw), rejects NaN, enforces min/max
 *   text    → String(raw).trim(); empty string treated as null
 *   select  → String(raw); empty string treated as null
 *   boolean → strict true / false (accepts string "true"/"false" too)
 */
export function coerceBulkUpdateValue(
  category: BulkUpdateCategory,
  fieldKey: string,
  raw: unknown
):
  | { value: string | number | boolean | null }
  | { error: string } {
  const field = findField(category, fieldKey);
  if (!field) {
    return {
      error: `Field "${fieldKey}" isn't bulk-updatable on ${category.toLowerCase()}.`,
    };
  }
  switch (field.inputType) {
    case "number": {
      if (raw === null || raw === undefined || raw === "") {
        return { error: `${field.label} is required.` };
      }
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        return { error: `${field.label} must be a number.` };
      }
      if (typeof field.min === "number" && n < field.min) {
        return { error: `${field.label} must be at least ${field.min}.` };
      }
      if (typeof field.max === "number" && n > field.max) {
        return { error: `${field.label} must be at most ${field.max}.` };
      }
      return { value: n };
    }
    case "text": {
      const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
      // For currency: enforce 3-letter ISO shape
      if (fieldKey === "currency" && s !== "" && !/^[A-Z]{3}$/.test(s.toUpperCase())) {
        return { error: "Currency must be a 3-letter ISO code (e.g. INR)." };
      }
      return { value: s === "" ? null : fieldKey === "currency" ? s.toUpperCase() : s };
    }
    case "select": {
      if (raw === null || raw === undefined || raw === "") return { value: null };
      return { value: String(raw) };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true") return { value: true };
      if (raw === "false") return { value: false };
      return { error: `${field.label} must be true or false.` };
    }
  }
}

/**
 * Per-category Prisma routing. The wizard's "select rows" step uses
 * this to scope the list query; the apply action uses it to pick the
 * right `updateMany` target.
 *
 * Customers and Vendors share the Contact table but filter by `type`.
 * Items have their own table.
 */
export type CategoryModel = {
  table: "item" | "contact";
  /** `where` to apply on every query for this category. */
  scopeWhere: object;
  /** Field name on the model that reflects "active" status (the
   *  inverse for Contact, which uses `isInactive`). */
  activeField: "isActive" | "isInactive";
};

export function modelForCategory(category: BulkUpdateCategory): CategoryModel {
  switch (category) {
    case "ITEMS":
      return {
        table: "item",
        scopeWhere: { deletedAt: null },
        activeField: "isActive",
      };
    case "CUSTOMERS":
      return {
        table: "contact",
        scopeWhere: {
          deletedAt: null,
          type: { in: ["CUSTOMER", "BOTH"] },
        },
        activeField: "isInactive",
      };
    case "VENDORS":
      return {
        table: "contact",
        scopeWhere: {
          deletedAt: null,
          type: { in: ["VENDOR", "BOTH"] },
        },
        activeField: "isInactive",
      };
  }
}
