import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  ArrowLeft,
  Repeat,
  Trash2,
  Pause,
  Play,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import { parseTemplate } from "@/lib/accounting/recurring-manual-journals";
import {
  deleteRecurringManualJournalByIdAction,
  pauseRecurringManualJournalByIdAction,
  resumeRecurringManualJournalByIdAction,
} from "../actions";

export const metadata = { title: "Recurring Manual Journal" };

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  EXPIRED: "Expired",
  STOPPED: "Stopped",
};

const MJ_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

function frequencyLabel(freq: string, intervalN: number): string {
  const base = freq.charAt(0).toUpperCase() + freq.slice(1).toLowerCase();
  if (intervalN <= 1) return base;
  return `Every ${intervalN} ${base.toLowerCase()}s`;
}

/**
 * ACCT-A.4.c — Detail page for a Recurring Manual Journal profile.
 * Shows the schedule, the template (account lines), and the list
 * of MJs already generated from this profile. Action buttons:
 *   Pause / Resume — flip status (no destructive action)
 *   Delete         — soft-delete (clears nothing on already-generated MJs;
 *                    the FK is ON DELETE SET NULL)
 */
export default async function RecurringManualJournalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();

  const profile = await db.recurringManualJournal.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!profile) notFound();

  // Load accounts + contacts + projects so we can render names
  // for the template rows. The template stores only ids.
  const template = parseTemplate(profile.templateJson);
  const accountIds = template?.lines.map((l) => l.accountId) ?? [];
  const contactIds = (template?.lines ?? [])
    .map((l) => l.contactId)
    .filter((v): v is string => !!v);
  const projectIds = (template?.lines ?? [])
    .map((l) => l.projectId)
    .filter((v): v is string => !!v);

  const [accounts, contacts, projects, generated] = await Promise.all([
    accountIds.length
      ? db.chartOfAccount.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, name: true, code: true, type: true },
        })
      : Promise.resolve([] as { id: string; name: string; code: string | null; type: string }[]),
    contactIds.length
      ? db.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, displayName: true, type: true },
        })
      : Promise.resolve([] as { id: string; displayName: string; type: string }[]),
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    db.manualJournal.findMany({
      where: { recurringManualJournalId: profile.id },
      orderBy: { date: "desc" },
      take: 50,
      select: { id: true, number: true, date: true, status: true },
    }),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const displayCurrency = template?.currency ?? organization.currency;
  const canPause = profile.status === "ACTIVE";
  const canResume = profile.status === "PAUSED";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/accountant/recurring-manual-journals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Repeat className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{profile.profileName}</h1>
        <div className="ml-auto flex items-center gap-2">
          {canPause && (
            <ActionFormButton
              action={pauseRecurringManualJournalByIdAction.bind(
                null,
                profile.id
              )}
              label="Pause"
              icon={<Pause className="h-4 w-4" />}
              variant="outline"
              size="sm"
              successToast="Profile paused"
            />
          )}
          {canResume && (
            <ActionFormButton
              action={resumeRecurringManualJournalByIdAction.bind(
                null,
                profile.id
              )}
              label="Resume"
              icon={<Play className="h-4 w-4" />}
              variant="default"
              size="sm"
              successToast="Profile resumed"
            />
          )}
          <ActionFormButton
            action={deleteRecurringManualJournalByIdAction.bind(
              null,
              profile.id
            )}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            variant="outline"
            size="sm"
            successToast="Profile deleted"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge
                variant={profile.status === "ACTIVE" ? "secondary" : "outline"}
              >
                {STATUS_LABEL[profile.status] ?? profile.status}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Frequency</div>
              <div>{frequencyLabel(profile.frequency, profile.intervalN)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Next occurrence
              </div>
              <div>{format(profile.nextOccurrenceDate, "dd MMM yyyy")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Start date</div>
              <div>{format(profile.startDate, "dd MMM yyyy")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">End date</div>
              <div>
                {profile.neverExpires
                  ? "Never expires"
                  : profile.endDate
                    ? format(profile.endDate, "dd MMM yyyy")
                    : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Generated</div>
              <div className="tabular-nums">{profile.occurrencesGenerated}</div>
            </div>
          </div>
          {template?.notes ? (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground">
                Notes (applied to every occurrence)
              </div>
              <div className="text-sm whitespace-pre-wrap">{template.notes}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!template ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Template is missing or malformed — generations will skip
              with an error.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Contact</th>
                  <th className="text-left p-3">Project</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {template.lines.map((l, i) => {
                  const acc = accountById.get(l.accountId);
                  const cc = l.contactId ? contactById.get(l.contactId) : null;
                  const pj = l.projectId ? projectById.get(l.projectId) : null;
                  return (
                    <tr key={i}>
                      <td className="p-3 font-mono text-xs">
                        {acc?.code ?? "—"}
                      </td>
                      <td className="p-3">
                        {acc?.name ?? (
                          <span className="text-muted-foreground italic">
                            (deleted)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {cc?.displayName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {pj?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {l.debit > 0 ? formatMoney(l.debit, displayCurrency) : ""}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {l.credit > 0
                          ? formatMoney(l.credit, displayCurrency)
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Generated journals{" "}
            <span className="text-xs text-muted-foreground font-normal ml-1">
              (most recent first)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {generated.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No journals generated yet — the cron will pick this profile
              up on{" "}
              <span className="font-medium">
                {format(profile.nextOccurrenceDate, "dd MMM yyyy")}
              </span>
              .
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Number</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {generated.map((m) => (
                  <tr key={m.id}>
                    <td className="p-3 font-mono text-xs">
                      <Link
                        href={`/accountant/manual-journals/${m.id}`}
                        className="text-primary hover:underline"
                      >
                        {m.number}
                      </Link>
                    </td>
                    <td className="p-3">{format(m.date, "dd MMM yyyy")}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          m.status === "PUBLISHED" ? "secondary" : "outline"
                        }
                        className="text-[10px]"
                      >
                        {MJ_STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
