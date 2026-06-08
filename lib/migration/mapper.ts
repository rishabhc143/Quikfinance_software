import "server-only";

/**
 * Tally Companion — canonical → Prisma persistence.
 *
 * Takes the format-agnostic CanonicalLedger / CanonicalVoucher
 * output from a parser, and produces the Prisma `create` payloads
 * for CompanionLedger / CompanionVoucher rows.
 *
 * Why this is a separate file rather than inlined in the upload
 * route:
 *   1. Testable in isolation — the tests run on canonical fixtures
 *      with no DB involvement.
 *   2. Future-proofs the Phase-2 "promote Companion → native"
 *      workflow — the canonical layer is the choke point, and
 *      this file describes how we land it.
 *   3. Mirror parsers in lib/migration/parsers/ — once we add the
 *      Zoho XML parser, it produces the same canonical types and
 *      flows through this exact mapper unchanged.
 */

import type { Prisma } from "@prisma/client";
import type { CanonicalLedger, CanonicalVoucher } from "./canonical";

/** Convert a Canonical ledger into a Prisma createMany row for
 *  CompanionLedger.
 *
 *  We intentionally don't dedup against existing rows here —
 *  idempotency is enforced by the partial unique index on
 *  (orgId, sourceFormat, sourceGuid) WHERE deletedAt IS NULL.
 *  The upload route does `createMany({ skipDuplicates: true })`
 *  so re-uploading a file merges instead of erroring. */
export function ledgerToCreateInput(
  l: CanonicalLedger,
  organizationId: string,
  migrationBatchId: string
): Prisma.CompanionLedgerCreateManyInput {
  return {
    organizationId,
    migrationBatchId,
    sourceFormat: l.sourceFormat,
    sourceGuid: l.sourceGuid,
    kind: l.kind,
    displayName: l.displayName,
    groupPath: l.groupPath ?? null,
    gstin: l.gstin ?? null,
    stateCode: l.stateCode ?? null,
    address: l.address ?? null,
    phone: l.phone ?? null,
    email: l.email ?? null,
    openingBalance: l.openingBalance != null ? l.openingBalance.toString() : null,
    openingBalanceAsOf: l.openingBalanceAsOf ? new Date(l.openingBalanceAsOf) : null,
    raw: l.raw as Prisma.InputJsonValue,
  };
}

/** Convert a Canonical voucher into a Prisma createMany row for
 *  CompanionVoucher.
 *
 *  The `partyLedgerId` cross-reference is RESOLVED LATER (in the
 *  upload route's second pass) because we need the ledgers to be
 *  inserted first to get their Prisma ids. v1 stores
 *  partyLedgerId=null at insert time and patches it post-insert
 *  via a single UPDATE keyed on the partyRef's sourceGuid. */
export function voucherToCreateInput(
  v: CanonicalVoucher,
  organizationId: string,
  migrationBatchId: string
): Prisma.CompanionVoucherCreateManyInput {
  return {
    organizationId,
    migrationBatchId,
    sourceFormat: v.sourceFormat,
    sourceGuid: v.sourceGuid,
    sourceVoucherNumber: v.sourceVoucherNumber,
    type: v.type,
    date: new Date(v.date),
    partyLedgerId: null, // resolved post-insert; see route handler
    placeOfSupply: v.placeOfSupply ?? null,
    narration: v.narration ?? null,
    currency: v.currency ?? null,
    subtotal: v.totals.subtotal.toString(),
    tax: v.totals.tax.toString(),
    total: v.totals.total.toString(),
    // Lines stored inline as JSON. We strip raw payloads from each
    // line at this layer (they balloon storage) but keep the
    // analytic fields the UI needs.
    lines: v.lines.map((l) => ({
      itemName: l.itemName ?? null,
      hsn: l.hsn ?? null,
      quantity: l.quantity ?? null,
      rate: l.rate ?? null,
      amount: l.amount,
      taxRate: l.taxRate ?? null,
      taxAmount: l.taxAmount ?? null,
      ledgerRef: l.ledgerRef ?? null,
    })) as unknown as Prisma.InputJsonValue,
    raw: v.raw as Prisma.InputJsonValue,
  };
}

/** Group canonical vouchers by their `partyRef.sourceGuid` for
 *  the post-insert party-link resolution. Returns a map suitable
 *  for the upload route's second-pass UPDATE.  */
export function indexVouchersByPartyGuid(
  vouchers: CanonicalVoucher[]
): Map<string, CanonicalVoucher[]> {
  const out = new Map<string, CanonicalVoucher[]>();
  for (const v of vouchers) {
    if (!v.partyRef) continue;
    const arr = out.get(v.partyRef.sourceGuid) ?? [];
    arr.push(v);
    out.set(v.partyRef.sourceGuid, arr);
  }
  return out;
}
