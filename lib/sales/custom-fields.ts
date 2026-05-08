/**
 * M17c: Custom Fields helpers shared between editor + form renderer.
 *
 * Schema is generic — same models (CustomFieldDefinition,
 * CustomFieldValue) serve any entity type by string key. This patch
 * wires INVOICE; QUOTE / SALES_ORDER / CUSTOMER follow later by passing
 * a different entityType to the same primitives.
 */

export const CUSTOM_FIELD_DATA_TYPES = [
  "text",
  "number",
  "date",
  "dropdown",
  "checkbox",
  "email",
  "url",
] as const;

export type CustomFieldDataType = (typeof CUSTOM_FIELD_DATA_TYPES)[number];

export type CustomFieldDataTypeLabel = {
  value: CustomFieldDataType;
  label: string;
};

export const DATA_TYPE_LABELS: CustomFieldDataTypeLabel[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
];

/**
 * Slugify a label into a stable field key. The user can edit the
 * generated value in the modal; this only seeds the input.
 *
 *   "Customer PO #"    -> "customer_po"
 *   "Salesperson Code" -> "salesperson_code"
 */
export function deriveFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Map an entityType slug to the URL segment. */
export const ENTITY_TYPE_URL: Record<string, string> = {
  INVOICE: "invoices",
  QUOTE: "quotes",
  SALES_ORDER: "sales-orders",
  CUSTOMER: "customers-and-vendors",
  DELIVERY_CHALLAN: "delivery-challans",
  DEBIT_NOTE: "debit-notes",
  CREDIT_NOTE: "credit-notes",
};

/** Reverse lookup. */
export const URL_TO_ENTITY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TYPE_URL).map(([k, v]) => [v, k])
);
