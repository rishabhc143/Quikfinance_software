import { z } from "zod";

export const itemFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: z.enum(["GOODS", "SERVICE"]).default("GOODS"),
  unit: z.string().max(40).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  images: z.array(z.string()).max(5).default([]),

  sellingPrice: z.coerce.number().nonnegative().optional().nullable(),
  salesAccountId: z.string().optional().nullable(),
  salesDescription: z.string().max(2000).optional().nullable(),
  // Zoho-parity Sales Information fields (migration 20260603140000).
  salesTaxId: z.string().optional().nullable(),
  sellingPriceInclusiveOfTax: z.coerce.boolean().default(false),

  costPrice: z.coerce.number().nonnegative().optional().nullable(),
  purchaseAccountId: z.string().optional().nullable(),
  purchaseDescription: z.string().max(2000).optional().nullable(),
  preferredVendorId: z.string().optional().nullable(),

  trackInventory: z.coerce.boolean().default(false),
  inventoryAccountId: z.string().optional().nullable(),
  openingStock: z.coerce.number().nonnegative().optional().nullable(),
  openingStockRate: z.coerce.number().nonnegative().optional().nullable(),
  reorderPoint: z.coerce.number().nonnegative().optional().nullable(),
});

export type ItemFormInput = z.infer<typeof itemFormSchema>;

export const ITEM_SORT_FIELDS = ["name", "sellingPrice", "costPrice", "updatedAt", "createdAt"] as const;
export type ItemSortField = (typeof ITEM_SORT_FIELDS)[number];

export const ITEM_UNITS = [
  "pcs", "kg", "g", "lb", "oz", "m", "cm", "ft", "in", "hr", "day",
  "box", "dozen", "set", "pack", "gallon", "liter", "ml",
] as const;
