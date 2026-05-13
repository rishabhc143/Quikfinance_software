import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ManualJournalForm } from "./form";

export const metadata = { title: "New Manual Journal" };

/**
 * ACCT-A — Server wrapper. Loads the org's active CoA entries so the
 * client form's account picker has something to populate.
 */
export default async function NewManualJournalPage() {
  const { organization } = await requireOrganization();

  const [accounts, contacts, projects] = await Promise.all([
    db.chartOfAccount.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true, name: true, code: true, type: true },
      orderBy: [{ type: "asc" }, { code: "asc" }, { name: "asc" }],
    }),
    db.contact.findMany({
      where: {
        organizationId: organization.id,
        isInactive: false,
        deletedAt: null,
      },
      select: { id: true, displayName: true, type: true },
      orderBy: { displayName: "asc" },
    }),
    db.project.findMany({
      where: { organizationId: organization.id, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/manual-journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">New Manual Journal</h1>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You need at least one Chart-of-Accounts entry first.{" "}
          <Link
            href="/accountant/chart-of-accounts/new"
            className="text-primary underline"
          >
            Create one
          </Link>
          .
        </p>
      ) : (
        <ManualJournalForm
          accounts={accounts}
          contacts={contacts}
          projects={projects}
          currency={organization.currency}
          defaultDate={format(new Date(), "yyyy-MM-dd")}
        />
      )}
    </div>
  );
}
