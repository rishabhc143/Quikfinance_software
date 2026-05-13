import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Book } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateAccountAction } from "../../actions";

export const metadata = { title: "Edit Account" };

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/**
 * ACCT-A — Edit a Chart-of-Accounts entry. Type is deliberately
 * read-only — changing it would silently break every JE that posts
 * to this account. To use a different type, archive and recreate.
 *
 * `code` is editable but uniqueness-checked server-side.
 */
export default async function EditChartOfAccountPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const account = await db.chartOfAccount.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!account) notFound();

  const isSystemAccount = account.code?.startsWith("SYS-") ?? false;

  // Bind the id so the server action can be passed to <form action={...}>.
  const onSubmit = updateAccountAction.bind(null, account.id);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/chart-of-accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Book className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Edit Account</h1>
        {isSystemAccount ? (
          <Badge variant="secondary" className="ml-2">
            <Lock className="h-3 w-3 mr-1" /> System account
          </Badge>
        ) : null}
      </div>

      {isSystemAccount ? (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-200">
            This is a system account (code starts with <code>SYS-</code>).
            You can still rename it, but it can&apos;t be archived because
            the auto-posting code (BNK-D Categorise, RPT-B Sales/Purchases
            posts) depends on its <code>code</code> to find it.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form action={onSubmit} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Code</Label>
                {isSystemAccount ? (
                  <>
                    <Input
                      defaultValue={account.code ?? ""}
                      maxLength={20}
                      disabled
                    />
                    <input type="hidden" name="code" value={account.code ?? ""} />
                    <p className="text-xs text-muted-foreground mt-1">
                      System account codes can&apos;t be changed.
                    </p>
                  </>
                ) : (
                  <>
                    <Input
                      name="code"
                      defaultValue={account.code ?? ""}
                      maxLength={20}
                      placeholder="e.g. 1100"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Optional. Unique per organization.
                    </p>
                  </>
                )}
              </div>
              <div>
                <Label>
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  name="name"
                  defaultValue={account.name}
                  maxLength={120}
                  required
                />
              </div>
            </div>

            <div>
              <Label>Type</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">
                  {TYPE_LABEL[account.type] ?? account.type}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Type can&apos;t be changed once saved. To use a different
                type, archive this account and create a new one.
              </p>
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                name="description"
                defaultValue={account.description ?? ""}
                rows={3}
                maxLength={500}
                placeholder="What's this account for?"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button asChild type="button" variant="outline">
                <Link href="/accountant/chart-of-accounts">Cancel</Link>
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
