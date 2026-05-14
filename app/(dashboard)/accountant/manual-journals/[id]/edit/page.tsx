import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import {
  ManualJournalForm,
  type ManualJournalFormInitialValues,
} from "../../new/form";

export const metadata = { title: "Edit Manual Journal" };

/**
 * ACCT-A.3 — Edit DRAFT manual journal.
 *
 * Loads the header + ManualJournalLine rows, pre-populates the
 * shared `ManualJournalForm` in edit mode. Refuses (server-side
 * redirect) when the journal is already PUBLISHED — those must
 * be corrected via a reversing manual journal, not an in-place
 * edit, to preserve audit history.
 */
export default async function EditManualJournalPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const header = await db.manualJournal.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: {
      lines: {
        orderBy: { position: "asc" },
        include: {
          reportingTagLinks: { select: { reportingTagId: true } },
        },
      },
    },
  });
  if (!header) notFound();
  if (header.status === "PUBLISHED") {
    // Bounce back to detail — the detail page renders a clear
    // "Published journals can't be edited" hint there.
    redirect(`/accountant/manual-journals/${header.id}`);
  }

  const [accounts, contacts, projects, reportingTags] = await Promise.all([
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
    db.reportingTag.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const initialValues: ManualJournalFormInitialValues = {
    date: format(header.date, "yyyy-MM-dd"),
    reverseJournalDate: header.reverseJournalDate
      ? format(header.reverseJournalDate, "yyyy-MM-dd")
      : "",
    publishReverseOnlyOnDate: header.publishReverseOnlyOnDate,
    referenceNumber: header.referenceNumber ?? "",
    notes: header.notes ?? "",
    reportingMethod: header.reportingMethod as
      | "ACCRUAL_AND_CASH"
      | "ACCRUAL_ONLY"
      | "CASH_ONLY",
    currency: header.currency ?? organization.currency,
    lines:
      header.lines.length > 0
        ? header.lines.map((l) => ({
            accountId: l.accountId,
            contactId: l.contactId ?? "",
            projectId: l.projectId ?? "",
            tagIds: l.reportingTagLinks.map((t) => t.reportingTagId),
            debit: Number(l.debit),
            credit: Number(l.credit),
            description: l.description ?? "",
          }))
        : [
            // Pre-A.3 DRAFTs (none in prod, but defensively): empty form.
            {
              accountId: "",
              contactId: "",
              projectId: "",
              tagIds: [],
              debit: 0,
              credit: 0,
              description: "",
            },
            {
              accountId: "",
              contactId: "",
              projectId: "",
              tagIds: [],
              debit: 0,
              credit: 0,
              description: "",
            },
          ],
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/accountant/manual-journals/${header.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          Edit Manual Journal{" "}
          <span className="font-mono text-base text-muted-foreground">
            {header.number}
          </span>
        </h1>
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
          reportingTags={reportingTags}
          currency={organization.currency}
          defaultDate={format(new Date(), "yyyy-MM-dd")}
          initialValues={initialValues}
          mode="edit"
          manualJournalId={header.id}
        />
      )}
    </div>
  );
}
