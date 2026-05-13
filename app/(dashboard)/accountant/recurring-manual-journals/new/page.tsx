import Link from "next/link";
import { ArrowLeft, Repeat } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import {
  RecurringManualJournalForm,
  type RecurringFormInitialValues,
} from "./form";

export const metadata = { title: "New Recurring Manual Journal" };

/**
 * ACCT-A.4.c — Server wrapper for the recurring-profile form.
 *
 * Supports `?fromMjId=<id>` so the "Make Recurring" button on a
 * PUBLISHED Manual Journal pre-populates the line table + the
 * Reference/Reporting Method/Currency/Notes header fields.
 */
export default async function NewRecurringManualJournalPage({
  searchParams,
}: {
  searchParams: { fromMjId?: string };
}) {
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

  // Optional pre-population from a source MJ.
  let initialValues: RecurringFormInitialValues | undefined;
  if (searchParams.fromMjId) {
    const source = await db.manualJournal.findFirst({
      where: {
        id: searchParams.fromMjId,
        organizationId: organization.id,
      },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    if (source) {
      initialValues = {
        profileName: `Recurring · ${source.number}`,
        frequency: "monthly",
        intervalN: 1,
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: "",
        neverExpires: true,
        referenceNumber: source.referenceNumber ?? "",
        reportingMethod: source.reportingMethod as
          | "ACCRUAL_AND_CASH"
          | "ACCRUAL_ONLY"
          | "CASH_ONLY",
        currency: source.currency ?? organization.currency,
        notes: source.notes ?? "",
        lines:
          source.lines.length > 0
            ? source.lines.map((l) => ({
                accountId: l.accountId,
                contactId: l.contactId ?? "",
                projectId: l.projectId ?? "",
                debit: Number(l.debit),
                credit: Number(l.credit),
                description: l.description ?? "",
              }))
            : [
                {
                  accountId: "",
                  contactId: "",
                  projectId: "",
                  debit: 0,
                  credit: 0,
                  description: "",
                },
                {
                  accountId: "",
                  contactId: "",
                  projectId: "",
                  debit: 0,
                  credit: 0,
                  description: "",
                },
              ],
      };
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/recurring-manual-journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">New Recurring Manual Journal</h1>
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
        <RecurringManualJournalForm
          accounts={accounts}
          contacts={contacts}
          projects={projects}
          currency={organization.currency}
          defaultDate={format(new Date(), "yyyy-MM-dd")}
          initialValues={initialValues}
        />
      )}
    </div>
  );
}
