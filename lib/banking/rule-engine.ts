/**
 * BNK-E — Transaction rule engine.
 *
 * Pure functions: take a bank line's facts + a rule (or list of
 * rules), return whether the rule matches. No DB, no React, no
 * Prisma. The DB-aware caller (importBankStatementAction) does the
 * heavy lifting around firing the action.
 *
 * Operator vocabulary (v1):
 *
 *   Text fields (DESCRIPTION / REFERENCE):
 *     CONTAINS / STARTS_WITH / EQUALS / IS_EMPTY
 *
 *   Numeric field (AMOUNT):
 *     EQ / GT / LT / GTE / LTE
 *
 * Combinator:
 *     AND — all conditions must match (default; v1 UI only exposes this)
 *     OR  — any condition matches (engine handles it for v2 / future)
 *
 * Direction (CREDIT vs DEBIT) is NOT checked here — that's an
 * action-side concern. The engine matches the row's text/amount
 * facts; the caller validates GL-account compatibility against the
 * direction.
 *
 * Robustness:
 *   - Text comparisons are case-insensitive and trim both sides.
 *   - IS_EMPTY treats null / undefined / "" / whitespace-only as empty.
 *   - Numeric comparisons coerce the rule.value via Number(); invalid
 *     numeric values cause the condition to fail (not throw).
 *   - An empty conditions list returns false (a rule with no
 *     conditions would match every row and is almost certainly a bug).
 */

export type RuleConditionField = "DESCRIPTION" | "REFERENCE" | "AMOUNT";

export type RuleTextOp = "CONTAINS" | "STARTS_WITH" | "EQUALS" | "IS_EMPTY";
export type RuleNumericOp = "EQ" | "GT" | "LT" | "GTE" | "LTE";
export type RuleConditionOp = RuleTextOp | RuleNumericOp;

export type RuleCondition = {
  field: RuleConditionField;
  op: RuleConditionOp;
  /** Stringified for storage consistency; numeric ops parse it on use. */
  value: string;
};

export type RuleCombinator = "AND" | "OR";

export type RuleInput = {
  conditions: RuleCondition[];
  combinator: RuleCombinator;
};

export type BankLineFacts = {
  description: string | null;
  reference: string | null;
  amount: number;
  type: "CREDIT" | "DEBIT";
};

const TEXT_OPS = new Set<RuleConditionOp>([
  "CONTAINS",
  "STARTS_WITH",
  "EQUALS",
  "IS_EMPTY",
]);

function isTextOp(op: RuleConditionOp): op is RuleTextOp {
  return TEXT_OPS.has(op);
}

function normaliseText(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function isEmpty(s: string | null | undefined): boolean {
  return !s || s.trim().length === 0;
}

function evalText(
  field: string | null | undefined,
  op: RuleTextOp,
  value: string
): boolean {
  if (op === "IS_EMPTY") return isEmpty(field);
  const f = normaliseText(field);
  const v = normaliseText(value);
  if (v.length === 0) return false; // non-IS_EMPTY ops need a value
  switch (op) {
    case "CONTAINS":
      return f.includes(v);
    case "STARTS_WITH":
      return f.startsWith(v);
    case "EQUALS":
      return f === v;
  }
}

function evalNumeric(amount: number, op: RuleNumericOp, value: string): boolean {
  const v = Number(value);
  if (!Number.isFinite(v)) return false;
  // Use abs() for AMOUNT so a rule "> 1000" matches both ₹+1500 and
  // ₹-1500. Direction is checked elsewhere.
  const a = Math.abs(amount);
  const b = Math.abs(v);
  switch (op) {
    case "EQ":
      return Math.abs(a - b) <= 0.0001;
    case "GT":
      return a > b;
    case "LT":
      return a < b;
    case "GTE":
      return a >= b;
    case "LTE":
      return a <= b;
  }
}

/** Evaluate one condition against the bank line. */
export function evalCondition(
  line: BankLineFacts,
  cond: RuleCondition
): boolean {
  if (cond.field === "AMOUNT") {
    if (isTextOp(cond.op)) return false; // misconfig: text op on numeric field
    return evalNumeric(line.amount, cond.op, cond.value);
  }
  // Text fields
  if (!isTextOp(cond.op)) return false; // misconfig: numeric op on text field
  const value =
    cond.field === "DESCRIPTION" ? line.description : line.reference;
  return evalText(value, cond.op, cond.value);
}

/** Does the rule match the bank line? Empty conditions list → false. */
export function matchesRule(line: BankLineFacts, rule: RuleInput): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return false;
  if (rule.combinator === "OR") {
    return rule.conditions.some((c) => evalCondition(line, c));
  }
  // AND (default)
  return rule.conditions.every((c) => evalCondition(line, c));
}

/**
 * Returns the first rule whose conditions match the bank line. The
 * caller is responsible for ordering rules by priority (per-account
 * first, then ascending priority). Returns null if no rule matches.
 */
export function firstMatchingRule<R extends RuleInput>(
  line: BankLineFacts,
  rules: R[]
): R | null {
  for (const rule of rules) {
    if (matchesRule(line, rule)) return rule;
  }
  return null;
}
