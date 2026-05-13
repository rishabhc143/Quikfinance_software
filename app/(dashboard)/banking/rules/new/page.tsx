import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { RuleForm } from "./rule-form";
import { createRuleAndRedirectAction } from "../actions";

export const metadata = { title: "New Transaction Rule" };

/**
 * BNK-E — Create form for transaction rules. Loads the org's active
 * bank accounts (scope picker) and active income/expense GL accounts
 * (action picker) and hands them to the client form.
 */
export default async function NewBankRulePage() {
  const { organization } = await requireOrganization();

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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/banking/rules">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">New Rule</h1>
      </div>
      <RuleForm
        bankAccounts={bankAccounts}
        glAccounts={glAccounts as Parameters<typeof RuleForm>[0]["glAccounts"]}
        onSubmitAction={createRuleAndRedirectAction}
        submitLabel="Create Rule"
      />
    </div>
  );
}
