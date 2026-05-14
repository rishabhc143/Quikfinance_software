import Link from "next/link";
import { Pencil, Plus, Archive, RotateCcw, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { seedDefaultCoaIfEmpty } from "@/lib/accounting/seed-default-coa";
import {
  archiveAccountByIdAction,
  restoreAccountByIdAction,
} from "./actions";

export const metadata = { title: "Chart of Accounts" };

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

type Filter = "active" | "all" | "archived";

function filterFromSearch(s: string | undefined): Filter {
  return s === "all" || s === "archived" ? s : "active";
}

/**
 * ACCT-A — CoA list with Edit + Archive controls and an Active /
 * All / Archived filter. System accounts (code starts with SYS-)
 * show a lock badge and can't be archived from this UI; archive
 * buttons are still rendered for them but trip a clean error.
 */
export default async function ChartOfAccountsPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const { organization } = await requireOrganization();
  const filter = filterFromSearch(searchParams?.filter);

  // ACCT-E — Seed the Zoho-parity default CoA the first time an
  // org lands on this page. No-op once the org has any non-SYS
  // accounts; race-safe via skipDuplicates on the unique constraint.
  await seedDefaultCoaIfEmpty(organization.id);

  const where = {
    organizationId: organization.id,
    ...(filter === "active"
      ? { isActive: true }
      : filter === "archived"
        ? { isActive: false }
        : {}),
  };

  const [accounts, totalActive, totalArchived] = await Promise.all([
    db.chartOfAccount.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
    }),
    db.chartOfAccount.count({
      where: { organizationId: organization.id, isActive: true },
    }),
    db.chartOfAccount.count({
      where: { organizationId: organization.id, isActive: false },
    }),
  ]);

  const grouped = accounts.reduce<Record<string, typeof accounts>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} {filter} account{accounts.length === 1 ? "" : "s"}
            {filter === "active" ? "" : " (filtered)"}
          </p>
        </div>
        <Button asChild>
          <Link href="/accountant/chart-of-accounts/new">
            <Plus className="h-4 w-4 mr-1" /> New Account
          </Link>
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 text-xs">
        <FilterPill
          href="/accountant/chart-of-accounts"
          label={`Active (${totalActive})`}
          active={filter === "active"}
        />
        <FilterPill
          href="/accountant/chart-of-accounts?filter=all"
          label={`All (${totalActive + totalArchived})`}
          active={filter === "all"}
        />
        <FilterPill
          href="/accountant/chart-of-accounts?filter=archived"
          label={`Archived (${totalArchived})`}
          active={filter === "archived"}
        />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
            {filter === "archived"
              ? "No archived accounts."
              : "No accounts yet. Create one to get started."}
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([type, list]) => (
          <Card key={type}>
            <CardContent className="pt-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {TYPE_LABELS[type] ?? type}
              </h3>
              <div className="rounded-md border divide-y">
                {list.map((a) => {
                  const isSystemAccount = a.code?.startsWith("SYS-") ?? false;
                  return (
                    <div
                      key={a.id}
                      className={
                        "flex items-center gap-3 p-2.5 text-sm " +
                        (!a.isActive ? "opacity-60" : "")
                      }
                    >
                      {a.code && (
                        <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                          {a.code}
                        </span>
                      )}
                      <Link
                        href={`/accountant/chart-of-accounts/${a.id}`}
                        className="flex-1 truncate text-primary hover:underline"
                      >
                        {a.name}
                      </Link>
                      {a.subType && (
                        <span className="text-xs text-muted-foreground hidden md:inline truncate max-w-[180px]">
                          {a.subType}
                        </span>
                      )}
                      {isSystemAccount ? (
                        <Badge
                          variant="outline"
                          className="text-[10px]"
                          title="System account — referenced by auto-posting code"
                        >
                          <Lock className="h-3 w-3 mr-1" /> System
                        </Badge>
                      ) : null}
                      {!a.isActive ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Archived
                        </Badge>
                      ) : null}
                      {a.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px] hidden lg:inline">
                          {a.description}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/accountant/chart-of-accounts/${a.id}/edit`}
                            aria-label="Edit account"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {a.isActive ? (
                          <ActionFormButton
                            action={archiveAccountByIdAction.bind(null, a.id)}
                            label=""
                            icon={<Archive className="h-3.5 w-3.5" />}
                            variant="ghost"
                            size="sm"
                            successToast="Account archived"
                          />
                        ) : (
                          <ActionFormButton
                            action={restoreAccountByIdAction.bind(null, a.id)}
                            label=""
                            icon={<RotateCcw className="h-3.5 w-3.5" />}
                            variant="ghost"
                            size="sm"
                            successToast="Account restored"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "px-2.5 py-1 rounded-md border transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </Link>
  );
}
