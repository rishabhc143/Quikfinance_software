# Accountant module

| Sub-module | Status |
|------------|--------|
| Chart of Accounts | **complete** (list grouped by type, new account form, type-aware) |
| Manual Journals | partial — actions done; UI list/create still to wire |
| Journal Entries | stub |

## Schema notes
`ChartOfAccount` supports parent-child for nested COA. `JournalEntry`/`JournalEntryLine` follow standard double-entry (debit + credit columns).
