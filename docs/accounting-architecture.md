# Quikfinance accounting architecture

This doc captures the ledger-posting conventions established across the
`BNK-D/E` and `RPT-A/B` PRs so a future engineer (or future you)
doesn't have to reverse-engineer them from a stack of commits.

> **Status (as of PR #124):** Every common Sales / Purchases /
> Banking transition posts to `JournalEntry`. Trial Balance balances
> for clean cycles. Remaining gaps: tax-account breakdown, line-item
> GL routing, inventory COGS — each large enough to be its own PR.

---

## 1. Where the ledger lives

Two tables (both pre-existing in the init migration):

```
JournalEntry        # one row per posted event
  id, organizationId, date, reference, notes, createdAt

JournalEntryLine    # 1..N rows per entry — must sum DR = CR
  id, journalEntryId, accountId → ChartOfAccount.id, debit, credit, description
```

`ChartOfAccount` is the canonical list of GL accounts. Every line
must reference a CoA entry; the `account` relation was added in
RPT-A so reports can join.

`JournalEntry.reference` is a free-text TEXT column. We use it as a
**structured idempotency key** so the same domain event posts at most
once. See §3 for the convention.

---

## 2. System accounts (auto-created on first use)

Domain code that needs to post a JE often needs a deterministic GL
account that may not exist yet (a brand-new org has an empty CoA).
The `lib/accounting/system-accounts.ts` helper lazy-creates them on
first need, keyed by a unique `code` per org.

| Kind | Code | CoA type | Used by |
|---|---|---|---|
| `AR` | `SYS-AR` | ASSET | Invoice posting, payment-received, write-offs |
| `AP` | `SYS-AP` | LIABILITY | Bill posting, payment-made, write-offs |
| `SALES_REVENUE` | `SYS-REV` | INCOME | Invoice sent (default) |
| `BILL_EXPENSE` | `SYS-EXP` | EXPENSE | Bill opened (default) |
| `CASH_ON_HAND` | `SYS-CASH` | ASSET | Fallback bank-side leg when no bank account configured |
| `SALES_RETURNS` | `SYS-SR` | EXPENSE | Sales credit notes (contra-revenue) |
| `PURCHASE_RETURNS` | `SYS-PR` | OTHER_INCOME | Vendor credits (contra-expense) |
| `BAD_DEBT_EXPENSE` | `SYS-BAD` | EXPENSE | Invoice write-offs |
| `BAD_DEBT_RECOVERY` | `SYS-RECOV` | OTHER_INCOME | Bill write-offs |
| `VENDOR_ADVANCES` | `SYS-VADV` | ASSET | Vendor prepayments + draw-downs |

Users see these in their Chart of Accounts UI like any other account
and can rename them, but the `code` is how the helper finds them
next time. **Don't change the codes** without a migration that
back-fills existing data.

The bank-side CoA for payments resolves through:
1. `Payment.depositToAccountId` / `paidThroughAccountId` (user-picked CoA)
2. `BankAccount.glAccountId` (BNK-D's lazy bridge — auto-creates a
   `BNK-<short bank id>` CoA the first time)
3. `SYS-CASH` (final fallback for orgs that haven't configured a bank yet)

---

## 3. Reference-key convention

Every post-helper writes `JournalEntry.reference` using a structured
key. Before insert, the helper does `findFirst` on the same key — if
found, returns the existing row (no-op idempotent). Reverse-helpers
do `deleteMany` on the same patterns.

| Domain event | `reference` value |
|---|---|
| Invoice SENT | `INV-SENT:<invoiceId>` |
| Payment received (per allocation) | `INV-PMT:<paymentReceivedId>:<invoiceId>` |
| Bill OPEN | `BILL-OPEN:<billId>` |
| Bill payment from cash (per allocation) | `BILL-PMT:<paymentMadeId>:<billId>` |
| Bill payment from advance (per allocation) | `BILL-PMT-ADV:<paymentMadeId>:<billId>` |
| Sales credit note OPEN | `CN-OPEN:<creditNoteId>` |
| Vendor credit OPEN | `VC-OPEN:<vendorCreditId>` |
| Invoice write-off | `INV-WRITEOFF:<invoiceId>` |
| Bill write-off | `BILL-WRITEOFF:<billId>` |
| Credit note refund | `CN-REFUND:<creditNoteId>:<refundId>` |
| Vendor credit refund | `VC-REFUND:<vendorCreditId>:<refundId>` |
| Vendor advance creation | `VA-CREATE:<paymentMadeId>` |
| Bank Money-In Categorise (BNK-D) | No reference (uses `notes` for traceability) |
| Bank rule auto-fire (BNK-E) | Same |

**Rules**:
- Refund / per-allocation references **nest the parent id first** so
  one `startsWith` query in the reverse-helper can sweep them all.
- Distinct prefixes (`BILL-PMT` vs `BILL-PMT-ADV`) keep `startsWith`
  queries from cross-matching unrelated JE rows.

---

## 4. The post / reverse helper library

All in `lib/accounting/post-domain-je.ts`. Every helper:
- Takes an active `Prisma.TransactionClient` so the JE write rolls
  back if the calling action fails.
- Idempotent via `findFirst` on the reference key.
- No-op for zero / negative amounts.
- Throws on a misconfigured GL account (defensive — direction errors
  are caught at the action layer first).

### Posts (12 helpers)

| Helper | DR | CR |
|---|---|---|
| `postInvoiceSentJe` | AR | Sales Revenue |
| `postInvoicePaymentJe` | Bank | AR |
| `postBillOpenJe` | Bill Expense | AP |
| `postBillPaymentJe` | AP | Bank |
| `postCreditNoteOpenJe` | Sales Returns | AR |
| `postVendorCreditOpenJe` | AP | Purchase Returns |
| `postInvoiceWriteOffJe` | Bad Debt Expense | AR |
| `postBillWriteOffJe` | AP | Bad Debt Recovery |
| `postCreditNoteRefundJe` | AR | Bank |
| `postVendorCreditRefundJe` | Bank | AP |
| `postVendorAdvanceCreateJe` | Vendor Advances | Bank |
| `postVendorAdvanceApplicationJe` | AP | Vendor Advances *(no Bank touch)* |

Plus `applyCategorise` in `lib/banking/apply-categorise.ts` for the
BNK-D bank-line Categorise + BNK-E rule auto-fire paths (creates an
Expense for DEBIT or a JournalEntry for CREDIT).

### Reverses

`reverseInvoiceSentJe`, `reverseAllInvoiceJes` (cascades to payments),
`reverseBillOpenJe`, `reverseAllBillJes`, `reverseCreditNoteJes`
(includes refunds), `reverseVendorCreditJes` (includes refunds),
`reverseInvoiceWriteOffJe`, `reverseBillWriteOffJe`,
`reversePaymentReceivedJes`, `reversePaymentMadeJes` (covers
BILL-PMT, BILL-PMT-ADV, and VA-CREATE).

---

## 5. Where actions live (and which transition posts)

| Action | Trigger | Post helper |
|---|---|---|
| `sales/invoices/actions.ts` `markInvoiceSentAction` | DRAFT → SENT | `postInvoiceSentJe` |
| `sales/invoices/actions.ts` `recordPaymentAction` | Per-allocation | `postInvoicePaymentJe` |
| `sales/invoices/actions.ts` `voidInvoiceAction` | Void | `reverseInvoiceSentJe` |
| `sales/invoices/actions.ts` `deleteInvoiceAction` | Soft-delete | `reverseAllInvoiceJes` |
| `sales/invoices/actions.ts` `writeOffInvoiceAction` | Status → WRITTEN_OFF | `postInvoiceWriteOffJe` |
| `sales/payments-received/actions.ts` `deletePaymentReceivedAction` | Hard-delete (no allocs only) | `reversePaymentReceivedJes` |
| `sales/credit-notes/actions.ts` `createCreditNoteAction` | Create as OPEN | `postCreditNoteOpenJe` |
| `sales/credit-notes/actions.ts` `voidCreditNoteAction` | Void | `reverseCreditNoteJes` |
| `sales/credit-notes/actions.ts` `deleteCreditNoteAction` | Soft-delete | `reverseCreditNoteJes` |
| `sales/credit-notes/actions.ts` `refundCreditNoteAction` | Per refund | `postCreditNoteRefundJe` |
| `purchases/bills/actions.ts` `markBillOpenAction` | DRAFT → OPEN | `postBillOpenJe` |
| `purchases/bills/actions.ts` `voidBillAction` | Void | `reverseBillOpenJe` |
| `purchases/bills/actions.ts` `softDeleteBillAction` | Soft-delete | `reverseAllBillJes` |
| `purchases/bills/actions.ts` `writeOffBillAction` | Status → WRITTEN_OFF | `postBillWriteOffJe` |
| `purchases/vendor-credits/actions.ts` `createVendorCreditAction` (OPEN path) | Create with status=OPEN | `postVendorCreditOpenJe` |
| `purchases/vendor-credits/actions.ts` `markVendorCreditOpenAction` | DRAFT → OPEN | `postVendorCreditOpenJe` |
| `purchases/vendor-credits/actions.ts` `voidVendorCreditAction` | Void | `reverseVendorCreditJes` |
| `purchases/vendor-credits/actions.ts` `deleteVendorCreditAction` | Soft-delete | `reverseVendorCreditJes` |
| `purchases/vendor-credits/actions.ts` `recordVendorCreditRefundAction` | Per refund | `postVendorCreditRefundJe` |
| `purchases/payments-made/actions.ts` `createBillPaymentAction` (FRESH allocs) | Per allocation | `postBillPaymentJe` |
| `purchases/payments-made/actions.ts` `createBillPaymentAction` (ADVANCE allocs) | Per allocation | `postVendorAdvanceApplicationJe` |
| `purchases/payments-made/actions.ts` `createVendorAdvanceAction` | Create | `postVendorAdvanceCreateJe` |
| `purchases/payments-made/actions.ts` `deletePaymentMadeAction` | Soft-delete | `reversePaymentMadeJes` |
| `banking/.../match/actions.ts` `categoriseAction` | Bank Categorise | `applyCategorise` |
| `banking/.../actions.ts` `importBankStatementAction` (Step 5) | Rule auto-fire | `applyCategorise` |

---

## 6. Reversal strategy

For voids / soft-deletes, the reverse-helpers **delete** the
corresponding JEs rather than posting reversing entries. This keeps
the Trial Balance clean (you're not seeing offsetting entries that
sum to zero), but loses some audit-trail nuance.

**Trade-off**: when an invoice with payments is voided, the
`INV-SENT` JE is deleted but payment JEs (`INV-PMT:*`) stay. The
result is a "customer credit" imbalance on AR — exactly the signal
an auditor would want to spot. We accept it as desired behavior;
the user must explicitly resolve it (refund or recategorise).

A future phase may switch to reversal JEs for full audit history.

---

## 7. Known gaps + scope deferrals

Everything below would close one or more residual Trial Balance
imbalances. None of them break the current happy paths.

### High-impact, India-specific
- **Tax-account breakdown** (CGST / SGST / IGST output payable + input
  recoverable as separate accounts). Today taxes flow through Revenue
  and Bill Expense, so the net P&L is right but GST reports can't
  pivot off the ledger.

### High-impact, complex
- **Line-item-level GL routing** — every invoice/bill line could post
  to a different income / expense account via `Item.salesAccountId`
  / `Item.purchaseAccountId`. Today everything funnels to Sales
  Revenue / Bill Expense.
- **Inventory COGS posting on shipment** — when an invoice ships a
  stock-tracked item, post `DR COGS / CR Inventory` at unit cost.
  Requires picking an inventory valuation method (FIFO / WAC) first.

### Lower priority
- **Multi-currency conversion JEs** — when an invoice / bill is in
  a non-base currency, post realised + unrealised FX gain/loss
  entries on payment.
- **Apply credit-note → invoice / vendor-credit → bill** — currently
  no new JE post (creation already adjusted AR/AP). Math holds but
  audit trail would benefit from an `APPLY:` reference.
- **Reverse-entry strategy** — see §6.
- **Cash-basis vs accrual-basis P&L toggle** — today P&L blends both
  in a single view; users can read each line but can't filter.

---

## 8. Trial Balance math (current state)

For a clean SMB cycle (invoice → payment → bill → payment → credit
note → write-off), the Trial Balance imbalance is ~0 modulo decimal
rounding. The known imbalances are exactly:

| Situation | Imbalance |
|---|---|
| Invoice voided with payments | +AR debit equal to total payment amount |
| Bill voided with payments | +AP credit equal to total payment amount |
| Tax-included invoice | 0 (tax flows through Revenue) |
| Item with `Item.salesAccountId` set | 0 (still posts to SYS-REV — see §7) |
| Stock-tracked invoice shipped | 0 (no COGS post yet) |
| Multi-currency invoice paid | Depends on FX delta |

The Trial Balance UI surfaces the imbalance with an amber warning so
users can spot the situations above.

---

## 9. File map

```
lib/accounting/
  system-accounts.ts       # lazy-create + cache the SYS-* CoA entries
  post-domain-je.ts        # 12 post helpers, 10 reverse helpers, bank-CoA resolver
lib/banking/
  apply-categorise.ts      # BNK-D / BNK-E entry point → Expense or JournalEntry
lib/reports/
  ledger-aggregation.ts    # aggregateLedgerLines, sumByBucket, trialBalanceImbalance
  csv-export.ts            # RFC 4180 + Response factory
app/(dashboard)/reports/
  trial-balance/           # /reports/trial-balance + CSV export
  profit-loss/             # Ledger-aware P&L + CSV export
  ar-aging/, ap-aging/, sales-summary/  # CSV exports
tests/unit/accounting/post-domain-je.test.ts  # 31 helper tests
tests/unit/reports/{ledger-aggregation, csv-export}.test.ts
```
