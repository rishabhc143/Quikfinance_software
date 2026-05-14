import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ALL_VALID_SUBTYPES } from "@/lib/accounting/coa-subtypes";
import { createAccountAction } from "../actions";

export const metadata = { title: "New Account" };

/**
 * ACCT-E.2 — Loads the org's existing accounts so the form can offer
 * a parent picker. Parent is grouped by type so the user can only
 * pick a same-type ancestor (the action validator enforces this on
 * the server side too).
 */
export default async function NewAccountPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/chart-of-accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">New Account</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createAccountAction} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Code</Label>
                <Input name="code" maxLength={20} placeholder="6300" />
              </div>
              <div>
                <Label>
                  Type <span className="text-destructive">*</span>
                </Label>
                <select
                  name="type"
                  defaultValue="EXPENSE"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="ASSET">Asset</option>
                  <option value="LIABILITY">Liability</option>
                  <option value="EQUITY">Equity</option>
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="COST_OF_GOODS_SOLD">Cost of Goods Sold</option>
                  <option value="OTHER_INCOME">Other Income</option>
                  <option value="OTHER_EXPENSE">Other Expense</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input name="name" required maxLength={120} />
              </div>
              <div>
                <Label>Sub-type</Label>
                <select
                  name="subType"
                  defaultValue=""
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— (use broad type)</option>
                  {ALL_VALID_SUBTYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Granular category (e.g. &quot;Cash&quot;, &quot;Fixed Asset&quot;).
                </p>
              </div>
              <div>
                <Label>Parent Account</Label>
                <select
                  name="parentId"
                  defaultValue=""
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— (top level)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code ? `${a.code} · ` : ""}
                      {a.name} ({a.type.toLowerCase().replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional. Must share the same type.
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea name="description" rows={2} maxLength={500} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild>
                <Link href="/accountant/chart-of-accounts">Cancel</Link>
              </Button>
              <Button type="submit">Create account</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
