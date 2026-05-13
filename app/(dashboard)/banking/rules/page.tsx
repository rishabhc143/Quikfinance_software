import Link from "next/link";
import { format } from "date-fns";
import { GitBranch, Plus, Pencil, Trash2, Power } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { deleteRuleByIdAction, toggleRuleByIdAction } from "./actions";

export const metadata = { title: "Transaction Rules" };

type Condition = {
  field: "DESCRIPTION" | "REFERENCE" | "AMOUNT";
  op: string;
  value: string;
};

const FIELD_LABEL: Record<Condition["field"], string> = {
  DESCRIPTION: "Description",
  REFERENCE: "Reference",
  AMOUNT: "Amount",
};

const OP_LABEL: Record<string, string> = {
  CONTAINS: "contains",
  STARTS_WITH: "starts with",
  EQUALS: "=",
  IS_EMPTY: "is empty",
  EQ: "=",
  GT: ">",
  LT: "<",
  GTE: ">=",
  LTE: "<=",
};

function summariseConditions(c: Condition[]): string {
  return c
    .map((cond) =>
      cond.op === "IS_EMPTY"
        ? `${FIELD_LABEL[cond.field]} is empty`
        : `${FIELD_LABEL[cond.field]} ${OP_LABEL[cond.op] ?? cond.op} "${cond.value}"`
    )
    .join("  &  ");
}

/**
 * BNK-E — List of transaction rules for this org. Shows scope, priority,
 * conditions, action target, and fire stats. Per-row toggle + edit +
 * delete actions.
 */
export default async function BankRulesPage() {
  const { organization } = await requireOrganization();

  const rules = await db.bankRule.findMany({
    where: { organizationId: organization.id },
    include: {
      bankAccount: { select: { id: true, name: true } },
      actionGlAccount: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ bankAccountId: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Transaction Rules</h1>
        <div className="ml-auto">
          <Button asChild className="gap-1">
            <Link href="/banking/rules/new">
              <Plus className="h-4 w-4" /> New Rule
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Rules auto-categorise bank lines on import. The first matching rule
        (per-account first, then by priority) wins. Manually-matched
        transactions are never overridden.
      </p>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center space-y-2">
            <GitBranch className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">No rules yet.</div>
            <p className="text-sm text-muted-foreground">
              Create your first rule to automate recurring categorisations on import.
            </p>
            <Button asChild className="gap-1 mt-2">
              <Link href="/banking/rules/new">
                <Plus className="h-4 w-4" /> Create Rule
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Priority</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Scope</th>
                    <th className="p-3">Conditions</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Fired</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.map((r) => {
                    const conditions = (r.conditionsJson as unknown as Condition[]) ?? [];
                    return (
                      <tr key={r.id} className={r.isActive ? undefined : "opacity-50"}>
                        <td className="p-3 tabular-nums">{r.priority}</td>
                        <td className="p-3">
                          <div className="font-medium">{r.name}</div>
                          {!r.isActive ? (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              Inactive
                            </Badge>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs">
                          {r.bankAccount ? r.bankAccount.name : "All accounts"}
                        </td>
                        <td className="p-3 text-xs">{summariseConditions(conditions)}</td>
                        <td className="p-3 text-xs">
                          Categorise →{" "}
                          <span className="font-medium">
                            {r.actionGlAccount.code
                              ? `${r.actionGlAccount.code} · ${r.actionGlAccount.name}`
                              : r.actionGlAccount.name}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {r.timesFired}×
                          {r.lastFiredAt ? (
                            <div className="text-muted-foreground text-[11px] mt-0.5">
                              last: {format(r.lastFiredAt, "dd MMM yyyy")}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <ActionFormButton
                              action={toggleRuleByIdAction.bind(null, r.id)}
                              label=""
                              icon={<Power className="h-3.5 w-3.5" />}
                              variant="ghost"
                              size="sm"
                              successToast={r.isActive ? "Rule paused" : "Rule activated"}
                            />
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                href={`/banking/rules/${r.id}/edit`}
                                aria-label="Edit rule"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <ActionFormButton
                              action={deleteRuleByIdAction.bind(null, r.id)}
                              label=""
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              variant="ghost"
                              size="sm"
                              successToast="Rule deleted"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
