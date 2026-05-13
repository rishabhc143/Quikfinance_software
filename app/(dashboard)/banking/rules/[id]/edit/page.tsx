import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RuleForm } from "../../new/rule-form";
import { updateRuleAndRedirectAction, type RuleInput } from "../../actions";

export const metadata = { title: "Edit Transaction Rule" };

/**
 * BNK-E — Edit form. Loads the rule + the same pickers as /new and
 * hands them to the shared RuleForm component.
 */
export default async function EditBankRulePage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const rule = await db.bankRule.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!rule) notFound();

  const [bankAccounts, glAccounts] = await Promise.all([
    db.bankAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.chartOfAccount.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
        type: { in: ["EXPENSE", "COST_OF_GOODS_SOLD", "INCOME", "OTHER_INCOME"] },
      },
      select: { id: true, name: true, code: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const initial: Partial<RuleInput> = {
    name: rule.name,
    bankAccountId: rule.bankAccountId,
    priority: rule.priority,
    isActive: rule.isActive,
    conditions: rule.conditionsJson as unknown as RuleInput["conditions"],
    combinator: rule.combinator as RuleInput["combinator"],
    actionGlAccountId: rule.actionGlAccountId,
    actionNotes: rule.actionNotes,
  };

  // Bind the rule id so the form action stays () => Promise<void>.
  const onSubmit = updateRuleAndRedirectAction.bind(null, rule.id);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/banking/rules">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Edit Rule</h1>
        <span className="text-sm text-muted-foreground ml-2">{rule.name}</span>
      </div>
      <RuleForm
        bankAccounts={bankAccounts}
        glAccounts={glAccounts as Parameters<typeof RuleForm>[0]["glAccounts"]}
        initial={initial}
        onSubmitAction={onSubmit}
        submitLabel="Save changes"
      />
    </div>
  );
}
