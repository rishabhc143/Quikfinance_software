import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { format } from "date-fns";
import {
  ArrowLeft,
  FileText,
  Trash2,
  RotateCcw,
  Pencil,
  Send,
  Repeat,
  Paperclip,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionFormButton } from "@/components/shared/action-form-button";
import { formatMoney } from "@/lib/money";
import {
  deleteManualJournalByIdAction,
  publishManualJournalByIdAction,
} from "../actions";

export const metadata = { title: "Manual Journal" };

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "COGS",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

const REPORTING_METHOD_LABEL: Record<string, string> = {
  ACCRUAL_AND_CASH: "Accrual and Cash",
  ACCRUAL_ONLY: "Accrual Only",
  CASH_ONLY: "Cash Only",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

type AccountSummary = { id: string; name: string; code: string | null; type: string };
type ContactSummary = { id: string; displayName: string; type: string } | null;
type ProjectSummary = { id: string; name: string } | null;
type TagSummary = { id: string; name: string; color: string };
type RenderLine = {
  id: string;
  account: AccountSummary;
  contact: ContactSummary;
  project: ProjectSummary;
  tags: TagSummary[];
  debit: number;
  credit: number;
  description: string | null;
};

/**
 * ACCT-A.3 — Detail page. DRAFT journals render their stored
 * `ManualJournalLine` rows and expose Edit + Publish buttons.
 * PUBLISHED journals continue to render from the canonical
 * `JournalEntryLine` rows under `MJ:<id>` (and `MJ-REV:<id>` for the
 * reverse posting). Delete works in both states.
 */
export default async function ManualJournalDetailPage({
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
          account: { select: { id: true, name: true, code: true, type: true } },
          contact: { select: { id: true, displayName: true, type: true } },
          project: { select: { id: true, name: true } },
          reportingTagLinks: {
            include: {
              reportingTag: { select: { id: true, name: true, color: true } },
            },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  });
  if (!header) notFound();

  const isDraft = header.status === "DRAFT";

  // PUBLISHED: pull from the JE so reports and the detail page agree.
  const [primaryJe, reverseJe] = isDraft
    ? [null, null]
    : await Promise.all([
        db.journalEntry.findFirst({
          where: {
            organizationId: organization.id,
            reference: `MJ:${header.id}`,
          },
          include: {
            lines: {
              include: {
                account: {
                  select: { id: true, name: true, code: true, type: true },
                },
                contact: {
                  select: { id: true, displayName: true, type: true },
                },
                project: { select: { id: true, name: true } },
                reportingTagLinks: {
                  include: {
                    reportingTag: {
                      select: { id: true, name: true, color: true },
                    },
                  },
                },
              },
            },
          },
        }),
        db.journalEntry.findFirst({
          where: {
            organizationId: organization.id,
            reference: `MJ-REV:${header.id}`,
          },
          include: {
            lines: {
              include: {
                account: {
                  select: { id: true, name: true, code: true, type: true },
                },
                contact: {
                  select: { id: true, displayName: true, type: true },
                },
                project: { select: { id: true, name: true } },
                reportingTagLinks: {
                  include: {
                    reportingTag: {
                      select: { id: true, name: true, color: true },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

  // Normalize the two sources into a single render shape.
  const lines: RenderLine[] = isDraft
    ? header.lines.map((l) => ({
        id: l.id,
        account: l.account,
        contact: l.contact,
        project: l.project,
        tags: l.reportingTagLinks.map((t) => t.reportingTag),
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
      }))
    : (primaryJe?.lines ?? []).map((l) => ({
        id: l.id,
        account: l.account,
        contact: l.contact,
        project: l.project,
        tags: l.reportingTagLinks.map((t) => t.reportingTag),
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description,
      }));
  const anyDims = lines.some((l) => l.contact || l.project);
  const anyTags = lines.some((l) => l.tags.length > 0);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  const displayCurrency = header.currency ?? organization.currency;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <BackLink href="/accountant/manual-journals"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          Manual Journal{" "}
          <span className="font-mono text-base text-muted-foreground">
            {header.number}
          </span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {isDraft && (
            <>
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link href={`/accountant/manual-journals/${header.id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
              <ActionFormButton
                action={publishManualJournalByIdAction.bind(null, header.id)}
                label="Publish"
                icon={<Send className="h-4 w-4" />}
                variant="default"
                size="sm"
                successToast="Manual journal published"
                redirects
              />
            </>
          )}
          {/* ACCT-A.4.c — Only PUBLISHED journals can be made
              recurring. DRAFTs aren't worth scheduling — finish
              them first. */}
          {!isDraft && (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link
                href={`/accountant/recurring-manual-journals/new?fromMjId=${header.id}`}
              >
                <Repeat className="h-4 w-4" /> Make Recurring
              </Link>
            </Button>
          )}
          <ActionFormButton
            action={deleteManualJournalByIdAction.bind(null, header.id)}
            label="Delete"
            icon={<Trash2 className="h-4 w-4" />}
            variant="outline"
            size="sm"
            successToast="Manual journal deleted"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="font-medium">
                {format(header.date, "dd MMM yyyy")}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Number</div>
              <div className="font-mono">{header.number}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge
                variant={
                  header.status === "PUBLISHED" ? "secondary" : "outline"
                }
              >
                {STATUS_LABEL[header.status] ?? header.status}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reference#</div>
              <div className="text-sm">
                {header.referenceNumber ? (
                  <span className="font-mono">{header.referenceNumber}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Reporting Method
              </div>
              <div className="text-sm">
                {REPORTING_METHOD_LABEL[header.reportingMethod] ??
                  header.reportingMethod}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Currency</div>
              <div className="text-sm">{displayCurrency}</div>
            </div>
            {header.reverseJournalDate ? (
              <div className="md:col-span-3">
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  Reverse Journal Date
                </div>
                <div className="text-sm">
                  {format(header.reverseJournalDate, "dd MMM yyyy")}
                  {header.publishReverseOnlyOnDate ? (
                    <span className="text-xs text-muted-foreground ml-2">
                      (publish-only-on-date checked)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {header.notes ? (
            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{header.notes}</div>
            </div>
          ) : null}
          {isDraft ? (
            <div className="border-t pt-3 text-xs text-muted-foreground">
              This journal hasn&apos;t been posted to the ledger yet. Click{" "}
              <b>Publish</b> to post it (and its reverse JE, if a reverse
              date is set) — or <b>Edit</b> to keep refining it.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isDraft ? "Draft lines" : "Posted lines"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Description</th>
                  {anyDims && <th className="text-left p-3">Contact</th>}
                  {anyDims && <th className="text-left p-3">Project</th>}
                  {anyTags && <th className="text-left p-3">Tags</th>}
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-mono text-xs">
                      {l.account.code ?? "—"}
                    </td>
                    <td className="p-3">{l.account.name}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {TYPE_LABEL[l.account.type] ?? l.account.type}
                    </td>
                    <td className="p-3 text-xs">{l.description ?? "—"}</td>
                    {anyDims && (
                      <td className="p-3 text-xs">
                        {l.contact ? (
                          <span>
                            {l.contact.displayName}{" "}
                            <span className="text-muted-foreground">
                              ({l.contact.type.toLowerCase()})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {anyDims && (
                      <td className="p-3 text-xs">
                        {l.project ? (
                          l.project.name
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {anyTags && (
                      <td className="p-3 text-xs">
                        {l.tags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {l.tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5"
                                style={{
                                  backgroundColor: `${t.color}1a`,
                                  color: t.color,
                                  border: `1px solid ${t.color}40`,
                                }}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-right tabular-nums">
                      {l.debit > 0 ? formatMoney(l.debit, displayCurrency) : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {l.credit > 0
                        ? formatMoney(l.credit, displayCurrency)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20">
                <tr>
                  <td
                    colSpan={4 + (anyDims ? 2 : 0) + (anyTags ? 1 : 0)}
                    className="p-3 text-right font-medium"
                  >
                    Totals
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalDebit, displayCurrency)}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {formatMoney(totalCredit, displayCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {isDraft
                ? "No lines yet — click Edit to add some."
                : header.createdAt < new Date("2026-05-13T00:00:00Z")
                  ? "Pre-ACCT-A legacy header — delete + recreate to attach proper double-entry lines."
                  : "No JE lines linked — something went wrong on create, please report."}
            </div>
          )}
        </CardContent>
      </Card>

      {header.attachments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Attachments
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({header.attachments.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {header.attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between p-3"
                >
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noopener"
                    className="hover:underline truncate inline-flex items-center gap-2"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    {a.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap ml-3">
                    {(a.fileSize / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {reverseJe && reverseJe.lines.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Reverse posting
              <Badge variant="secondary" className="ml-1 font-normal">
                {format(reverseJe.date, "dd MMM yyyy")}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Account</th>
                  <th className="text-right p-3">Debit</th>
                  <th className="text-right p-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reverseJe.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-mono text-xs">
                      {l.account.code ?? "—"}
                    </td>
                    <td className="p-3">{l.account.name}</td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(l.debit) > 0
                        ? formatMoney(Number(l.debit), displayCurrency)
                        : ""}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {Number(l.credit) > 0
                        ? formatMoney(Number(l.credit), displayCurrency)
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
