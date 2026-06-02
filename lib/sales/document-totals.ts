import { db } from "@/lib/db";
import { computeDocument, type DocumentComputed } from "./totals";

/**
 * Audit r2 (R2-3): shared "fetch taxes + map lines + compute" pattern
 * extracted from 10 server action files. Each transaction action
 * previously had its own local `totalsFor(orgId, input)` doing the
 * same thing.
 *
 * Why a separate file (vs. extending `lib/sales/totals.ts`):
 * `totals.ts` is intentionally pure — no Prisma, no env, runs in any
 * context (tests, scripts, the parser fallback, etc.). This helper
 * adds the Prisma dependency for the tax lookup, so it lives next to
 * the pure math instead of polluting it.
 */

export type DocumentTotalsLineInput = {
  quantity?: number | null;
  rate?: number | null;
  discount?: number | null;
  discountType?: "percentage" | "amount" | null;
  taxId?: string | null;
};

export type DocumentTotalsInput = {
  lines: DocumentTotalsLineInput[];
  /** Document-level discount — Invoice/Quote/SO/Bill/PO have this; CN/DC/DN don't. */
  documentDiscount?: {
    value?: number | null;
    type?: "percentage" | "amount" | null;
  } | null;
  /** Document-level TDS/TCS — same coverage pattern as documentDiscount. */
  documentTax?: { taxId: string; type: "TDS" | "TCS" } | null;
  /** Signed adjustment in document currency. Invoice has this; CN/DC/DN don't. */
  adjustmentValue?: number | null;
};

/**
 * Fetch active taxes for the org, look up rates by id, and call
 * `computeDocument` with the resolved per-line + document-level tax
 * rates. Returns the same `DocumentComputed` shape as the underlying
 * pure helper.
 *
 * Behavior preserved exactly from the inline `totalsFor` callers:
 *   - Missing/unknown taxId → rate 0
 *   - Missing discount/discountType → 0% percentage discount (no-op)
 *   - Missing document-level fields → not passed to computeDocument
 *     (which treats `undefined` as absent — same arithmetic result
 *     as omitting them from the inline call).
 */
export async function computeDocumentTotals(
  orgId: string,
  input: DocumentTotalsInput
): Promise<DocumentComputed> {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null): number => {
    if (!id) return 0;
    const t = taxes.find((x) => x.id === id);
    return t ? Number(t.rate) : 0;
  };
  const docTaxRate = input.documentTax ? taxRate(input.documentTax.taxId) : 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      discount: l.discount ?? 0,
      discountType: l.discountType ?? "percentage",
      taxRate: taxRate(l.taxId),
    })),
    documentDiscount: input.documentDiscount
      ? {
          value: input.documentDiscount.value ?? 0,
          type: input.documentDiscount.type ?? "percentage",
        }
      : undefined,
    documentTax: input.documentTax
      ? { rate: docTaxRate, type: input.documentTax.type }
      : undefined,
    adjustment: input.adjustmentValue ?? 0,
  });
}
