import Link from "next/link";
import { Plus, MoreHorizontal } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { seedDefaultCoaIfEmpty } from "@/lib/accounting/seed-default-coa";
import { CoaTable } from "./coa-table";
import { StatusSwitcher } from "./status-switcher";
import { CoaSearchBox } from "./search-box";

export const metadata = { title: "Chart of Accounts" };

type Status = "active" | "all" | "archived";

function parseStatus(s: string | undefined): Status {
  return s === "all" || s === "archived" ? s : "active";
}

/**
 * ACCT-E.2 — Chart of Accounts list, pixel-perfect Zoho layout.
 *
 * Header strip:
 *   [ Active Accounts ▾ ]      [ 🔍 search ]     [ + New ]
 *
 * Table columns:
 *   ☐  Account Name        Code     Type      Docs    Parent     ⋯
 *
 * SYS-* rows show a lock icon instead of a checkbox; selecting
 * other rows reveals a bulk Archive / Restore toolbar above the
 * table. The Active / All / Archived status dropdown is wired to
 * `?status=` in the URL so it's bookmarkable.
 */
export default async function ChartOfAccountsPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string };
}) {
  const { organization } = await requireOrganization();
  const status = parseStatus(searchParams?.status);
  const q = (searchParams?.q ?? "").trim();

  // Seed the Zoho-parity defaults the first time an org lands here.
  await seedDefaultCoaIfEmpty(organization.id);

  const where: Prisma.ChartOfAccountWhereInput = {
    organizationId: organization.id,
    ...(status === "active"
      ? { isActive: true }
      : status === "archived"
        ? { isActive: false }
        : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { subType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [accounts, totalActive, totalArchived] = await Promise.all([
    db.chartOfAccount.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
      include: {
        parent: { select: { name: true, code: true } },
      },
    }),
    db.chartOfAccount.count({
      where: { organizationId: organization.id, isActive: true },
    }),
    db.chartOfAccount.count({
      where: { organizationId: organization.id, isActive: false },
    }),
  ]);

  const rows = accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    subType: a.subType,
    parentName: a.parent?.name ?? null,
    parentCode: a.parent?.code ?? null,
    isActive: a.isActive,
    description: a.description,
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <StatusSwitcher
          current={status}
          counts={{
            active: totalActive,
            all: totalActive + totalArchived,
            archived: totalArchived,
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <CoaSearchBox initial={q} />
          <Button asChild>
            <Link href="/accountant/chart-of-accounts/new">
              <Plus className="h-4 w-4 mr-1" /> New
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label="More actions"
          >
            {/* Reserved for future bulk-import / export / settings.
                Renders as a passthrough link to a "More" page that
                doesn't exist yet → coming in ACCT-E.3. */}
            <Link
              href="/accountant/chart-of-accounts"
              aria-disabled
              className="pointer-events-none opacity-50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {rows.length} {status === "all" ? "" : status} account
        {rows.length === 1 ? "" : "s"}
        {q ? ` matching "${q}"` : ""}
      </p>

      <CoaTable rows={rows} />
    </div>
  );
}
