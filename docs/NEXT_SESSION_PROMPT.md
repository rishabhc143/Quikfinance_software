# Next-session prompt — finish D4.4 (LLM fallback)

Paste the **"Prompt to paste"** section below into a fresh Claude Code session opened inside this repo (or a fresh clone of `https://github.com/rishabhc143/Quikfinance_software`). The first thing Claude Code will do is read `CLAUDE.md` at the project root — that handles the broad project context. This file gives the task-specific continuation instructions.

---

## Where we left off

**Shipped today (2025-05-22):**
- ✅ PR #237 — D4.1 password-protected PDFs (merged)
- ✅ PR #238 — D4.2 inline edit + confidence badge + auto bank-account match (merged)
- ✅ PR #239 — D4.3 auto-link bank credits/debits to outstanding Invoices/Bills (merged — `d70adf2` on `main`)
- ⏳ Branch `feat/documents-d4-4-llm-fallback` — D4.4 WIP: lib + tests pushed (commit `37b36aa`). **Wiring + UI + PR remain.**

**Done on D4.4 already:**
- `lib/documents/parsers/llm-fallback.ts` — `parseBankStatementWithLLM(text, hint?)` + `isLlmFallbackEnabled()`. Haiku-first, sonnet retry on malformed JSON, zod-validated response, fail-open on every error path.
- `tests/unit/documents/parsers/llm-fallback.test.ts` — 15 passing tests (env-gate / size guards / happy path / fence stripping / retry path / schema validation / API errors).

## What remains to ship D4.4

### 1. Wire the fallback into the 3 server-action call sites

Open `app/(dashboard)/documents/actions.ts`:

**a) `uploadDocumentsAction` (~line 700)** — after the `parseByDocumentType(extractedText, documentType)` call:

```ts
extractedFields = parseByDocumentType(extractedText, documentType);

// DOC-D4.4: Claude fallback when heuristic returns null OR empty rows
// on a bank statement. No-op when ANTHROPIC_API_KEY isn't set.
let parserSource: "heuristic" | "llm" | "manual" = "heuristic";
const isBankStmt = documentType === "BANK_STATEMENT";
const heuristicEmpty =
  !extractedFields ||
  ("rows" in extractedFields && extractedFields.rows.length === 0);
if (isBankStmt && heuristicEmpty && isLlmFallbackEnabled()) {
  const llm = await parseBankStatementWithLLM(extractedText);
  if (llm && llm.rows.length > 0) {
    extractedFields = llm;
    parserSource = "llm";
  }
}
```

Then thread `parserSource` into the JSONB persist. The simplest path: don't change the column shape — store the tag inside the existing JSONB by extending `ParsedBankStatement` with `_meta?: { parserSource: "..." }`. Update `lib/documents/parsers/bank-statement-types.ts` to add this optional field.

Persist:
```ts
extractedFields: extractedFields
  ? ({ ...extractedFields, _meta: { parserSource } } as unknown as Prisma.InputJsonValue)
  : Prisma.JsonNull,
```

(Or use a separate Document column — see "alternative" below.)

**b) `uploadBankStatementsAction` (~line 1322)** — same pattern after `parseByDocumentType(extractedText, "BANK_STATEMENT")`.

**c) `retryExtractWithPasswordAction` (~line 1524)** — same pattern after the post-password `parseByDocumentType(result.text, documentType)`.

**Imports to add at the top of actions.ts:**
```ts
import {
  parseBankStatementWithLLM,
  isLlmFallbackEnabled,
} from "@/lib/documents/parsers/llm-fallback";
```

### 2. NEW server action: `retryParseWithLLMAction({ documentId })`

After the existing `retryExtractWithPasswordAction`. Validates:
- Org scope (`requireOrganization` + verify `Document.organizationId` matches)
- Document is a PDF / bank statement
- Has `extractedText` (otherwise nothing to send)
- `isLlmFallbackEnabled()`

Then:
- Call `parseBankStatementWithLLM(doc.extractedText)`
- If non-null + non-empty rows, update `Document.extractedFields` with the new parsed result + `_meta.parserSource = "llm"`
- `writeAuditLog` with `action: "UPDATE"` + `after: { source: "llm-fallback-manual" }`
- Return `{ ok: true, rowCount }` or `{ ok: false, error: "..." }`

### 3. NEW server action: `isLlmFallbackEnabledAction()`

Tiny wrapper so the client drawer can decide whether to render the "Re-run parse with AI" button. Just:
```ts
export async function isLlmFallbackEnabledAction(): Promise<boolean> {
  return isLlmFallbackEnabled();
}
```

### 4. UI — `app/(dashboard)/documents/document-preview-drawer.tsx`

In `BankStatementTransactionsPanel`:

- Read `parserSource` from `parsed._meta?.parserSource` (or however you wired it in step 1).
- Next to the existing confidence chip, render a violet chip when `parserSource === "llm"`:
  ```tsx
  {parserSource === "llm" ? (
    <span
      className="text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-800"
      title="Heuristic parser couldn't read this layout — Claude generated these rows. Cost ~₹0.85 per statement."
    >
      AI parsed
    </span>
  ) : null}
  ```

In the same panel header toolbar, add a "Re-run parse with AI" button when:
- Heuristic returned 0 rows (i.e. `parsed.bank === "UNKNOWN"` AND `parsed.rows.length === 0`)
- AND `llmFallbackEnabled === true` (fetched once on drawer mount via `isLlmFallbackEnabledAction`)

```tsx
const [llmEnabled, setLlmEnabled] = React.useState(false);
const [llmBusy, setLlmBusy] = React.useState(false);

React.useEffect(() => {
  void isLlmFallbackEnabledAction().then(setLlmEnabled);
}, []);

async function runWithLlm() {
  setLlmBusy(true);
  const r = await retryParseWithLLMAction({ documentId });
  setLlmBusy(false);
  if (!r.ok) { toast.error(r.error); return; }
  toast.success(`Parsed ${r.rowCount} rows via AI.`);
  router.refresh();
}
```

### 5. Verify locally

```bash
pnpm prisma generate
pnpm type-check
pnpm lint
pnpm test --run                 # expect 1,162 + 15 new = ~1,177 total
pnpm build
```

### 6. Commit, push, PR

```bash
git add -A app/(dashboard)/documents/actions.ts \
           app/(dashboard)/documents/document-preview-drawer.tsx \
           lib/documents/parsers/bank-statement-types.ts
git commit -m "feat(documents): D4.4 wire-up — Claude fallback + AI-parsed chip + manual trigger"
git push
gh pr create --title "feat(documents): D4.4 — Claude fallback for unknown bank layouts" --body "$(cat <<'EOF'
## Summary
- Wires \`parseBankStatementWithLLM\` from the D4.4 lib (already on this branch) into the 3 upload/retry action call sites
- Adds \`retryParseWithLLMAction\` + \`isLlmFallbackEnabledAction\` for the drawer's manual trigger button
- Adds a violet "AI parsed" chip when \`parserSource === "llm"\`
- Self-disables when \`ANTHROPIC_API_KEY\` isn't set in Vercel env (free deploys unchanged)

## Test plan
- [ ] Without \`ANTHROPIC_API_KEY\`: upload an unknown-bank statement → heuristic returns 0 rows → drawer shows extracted text only, no AI chip, no button
- [ ] With \`ANTHROPIC_API_KEY\` set: same statement → fallback fires automatically → rows populate + violet "AI parsed" chip shows
- [ ] Manual trigger: click "Re-run parse with AI" → spinner → rows refresh + success toast
- [ ] Cost confirmed at ~₹0.85 per statement via Anthropic dashboard

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks <num> --watch
gh pr merge <num> --squash --delete-branch
```

### 7. Post-merge

- Wait ~3 min for Vercel deploy
- Surface to user: tell them to set `ANTHROPIC_API_KEY` in Vercel env (Production + Preview + Development) and redeploy if they want the feature live
- D4.4 closes the D4 series. Ask user what's next (D5 / pivot module / other).

---

## Alternative wiring choice (column vs JSONB)

The plan above uses an in-JSONB `_meta.parserSource` field for simplicity (no migration). If preferred, an additive migration can add `Document.parserSource TEXT` directly:

```sql
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "parserSource" TEXT;
```

Trade-off: column lets you index/query by source (good for cost-tracking dashboards later) at the cost of one more migration. JSONB tag is zero-migration but harder to aggregate. Recommend JSONB for D4.4; column migration when D4.4b (spending cap) lands.

---

## Prompt to paste into the new Claude Code session

```
I'm continuing work on Quikfinance — a Zoho Books clone (Next.js 14 + Prisma + Postgres on Neon, deployed to Vercel at https://quikfinance-software.vercel.app).

The project root has a CLAUDE.md file with full context — please read it first to understand the codebase conventions.

We just finished a multi-PR push (D4.1/D4.2/D4.3 all merged into main). I'm mid-way through D4.4 — the Claude API fallback for unknown bank-statement layouts. The branch `feat/documents-d4-4-llm-fallback` is already pushed to GitHub with the lib helper + 15 passing tests landed (commit 37b36aa).

The remaining work is wiring + UI. Read `docs/NEXT_SESSION_PROMPT.md` for the exact tasks, then go ahead and ship D4.4 end-to-end: wire the fallback into the 3 upload-action call sites, add `retryParseWithLLMAction` + `isLlmFallbackEnabledAction`, add the violet "AI parsed" chip + manual trigger button to the drawer, run the full verify gauntlet (type-check, lint, tests, build), and open a PR.

Please:
1. Check out `feat/documents-d4-4-llm-fallback` (don't create a new branch)
2. Implement all the wiring described in `docs/NEXT_SESSION_PROMPT.md`
3. Run `pnpm type-check && pnpm lint && pnpm test --run && pnpm build`
4. Commit, push, open a PR, watch CI
5. Merge on green and verify on prod after Vercel promotes

Background context to recall:
- Single dev project — fast iteration, ship-to-prod-on-merge cadence
- Fail-open everywhere (free deploys without `ANTHROPIC_API_KEY` must still work)
- Idempotent migrations only
- Indian Rupee formatting + dd/MM/yyyy display

Go.
```

---

## Quick sanity check before starting

```bash
git checkout feat/documents-d4-4-llm-fallback
git pull
git log -3 --oneline    # should show 37b36aa at top
pnpm install            # ensure deps match
pnpm test --run tests/unit/documents/parsers/llm-fallback.test.ts   # should be 15 passing
```

If any of those fail, fix that first — never start the wiring work on a broken local state.
