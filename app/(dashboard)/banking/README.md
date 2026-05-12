# Banking module

## Status (post-BNK-A)

| Sub-module | Status |
|------------|--------|
| Empty-state UX | ✅ Zoho-parity "Stay on top of your money" page when no accounts exist |
| Bank Accounts | ✅ Bank / Credit Card / PayPal types with Zoho-parity Add form (conditional fields per type) |
| Per-account dashboard | ✅ Detail page with transactions table + Import Statement + Undo Last Import |
| CSV Statement Import | ✅ 4-step wizard (Upload → Mapping → Preview → Done) with auto-detect, three Amount-column modes, duplicate detection, save-as-preset |
| Undo Last Import | ✅ Gear menu, batch-level delete, refuses to undo reconciled transactions |
| Transactions | ✅ List with account filter, debit/credit type, reconciled flag (legacy, predates BNK-A) |
| Bank Transfers | stub — BNK-A.next |
| Card Payments | stub — BNK-A.next |
| Owner Drawings | stub — BNK-A.next |
| Other Income | stub — BNK-A.next |

## Architecture

### Account model

`BankAccount.type` is the Zoho-parity enum (`BANK | CREDIT_CARD | PAYPAL`). The
legacy free-text `accountType` column stays for backward compat but new code
reads `type`. Each `BANK` account has `isPrimary` (only one primary per org,
enforced by a partial unique index).

### CSV import flow

```
User uploads CSV →  lib/banking/csv-import.ts autoDetects column map →
  wizard's Mapping step lets user override →
  Preview shows first 10 parsed rows + per-row errors →
  importBankStatementAction:
    - parseCsv() turns rows into ParsedRow[] with type=DEBIT|CREDIT
    - markDuplicates() flags rows matching the (accountId, date, amount, reference) quadruple
    - one BankImportBatch + N BankTransaction rows in a $transaction
    - duplicate rows still inserted but excluded=true (so Undo can find them)
```

### Duplicate detection

`lib/banking/duplicate-detection.ts` matches on the quadruple Zoho documents:

- Same calendar day (UTC, ignore time)
- Same amount (4-decimal-place tolerance for Decimal columns)
- Same reference (case-insensitive, trimmed)
- Empty reference → cannot dedup confidently → returns null

Duplicates are still persisted with `excluded=true` so:

1. **Undo Last Import** can find every row the batch created
2. User can manually un-exclude if the heuristic was wrong
3. Audit trail stays complete

### Amount column types

Three modes Zoho documents, all supported:

| Mode | When to use | Example |
|------|-------------|---------|
| `DOUBLE` | Bank exports separate Debit + Credit columns | ICICI, HDFC |
| `SINGLE_WITH_TYPE` | Bank exports Amount + DR/CR column | Some SBI variants |
| `SINGLE_NEGATIVE` | Bank exports Amount with negatives = withdrawals | US banks, OFX |

Auto-detected on file upload; user can override in the Mapping step.

### Saved presets

After a successful import, the wizard offers to save the column map as a named
preset (e.g. "ICICI monthly statement"). Next month's import shows the preset
as a one-click button — same mapping, no re-pick.

`BankImportPreset` is unique on `(bankAccountId, name)` so each bank has its
own preset namespace.

## What's next

- BNK-B — per-account dashboard with 6 metric tiles (Total Transactions /
  Autocategorised / Recognised / Best Matches / Uncategorised / Duplicates)
- BNK-C — Match Transactions UI (the heart of the module)
- BNK-D — Categorise (no-match fallback) + Adjustments + Multi-select
- BNK-E — Transaction Rules CRUD + apply-on-import
- BNK-F — Reconciliation flow
- BNK-G — OFX / QIF / CAMT.053 parsers
- BNK-J — Yodlee auto-feeds (vendor contract required)
- BNK-K — Direct partner-bank APIs (ICICI / HDFC / Axis Connected Banking)

See `docs/zoho-banking-research.md` for the full Zoho-parity spec.
