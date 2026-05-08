import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Pencil, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import { softDeleteDebitNoteAction, voidDebitNoteAction } from "../actions";

export default async function DebitNoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const dn = await db.debitNote.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      lineItems: { orderBy: { position: "asc" } },
    },
  });
  if (!dn) notFound();

  const auditLogs = await db.auditLog.findMany({
    where: {
      organizationId: organization.id,
      entityType: "DebitNote",
      entityId: dn.id,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  });

  const ccy = dn.currency;
  const isVoid = dn.status === "VOID";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/sales/debit-notes" className="hover:underline">
          Debit Notes
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{dn.debitNoteNumber}</span>
      </nav>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to debit notes">
            <Link href="/sales/debit-notes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold font-mono">
            <span className="sr-only">Debit Note </span>
            {dn.debitNoteNumber}
          </h1>
          <Badge
            variant={isVoid ? "outline" : "secondary"}
            aria-label={`Status: ${dn.status.toLowerCase()}`}
          >
            {dn.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isVoid && Number(dn.amountApplied) === 0 ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/sales/debit-notes/${dn.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/sales/debit-notes/${dn.id}/pdf`} target="_blank">
                  Download PDF
                </Link>
              </DropdownMenuItem>
              {!isVoid ? (
                <DropdownMenuItem asChild>
                  <form action={voidDebitNoteAction.bind(null, dn.id)}>
                    <button type="submit" className="w-full text-left">
                      Mark as Void
                    </button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={softDeleteDebitNoteAction.bind(null, dn.id)}
            confirmText="Delete this debit note? It can be restored from the trash."
            redirectTo="/sales/debit-notes"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Customer
            </div>
            <div className="font-medium">
              <Link
                href={`/sales/customers/${dn.contactId}`}
                className="hover:underline"
              >
                {dn.contact.displayName}
              </Link>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </div>
            <div>{format(dn.debitNoteDate, "dd MMM yyyy")}</div>
            {dn.referenceNumber ? (
              <>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
                  Reference
                </div>
                <div>{dn.referenceNumber}</div>
              </>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Total
            </div>
            <div className="text-2xl font-semibold">
              {formatMoney(Number(dn.total), ccy)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Applied {formatMoney(Number(dn.amountApplied), ccy)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Line items on debit note {dn.debitNoteNumber}
            </caption>
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 text-left">Item</th>
                <th scope="col" className="p-2 text-right">Qty</th>
                <th scope="col" className="p-2 text-right">Rate</th>
                <th scope="col" className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dn.lineItems.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    <div className="font-medium">{l.name}</div>
                    {l.description ? (
                      <div className="text-xs text-muted-foreground">
                        {l.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {l.quantity.toString()}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.rate), ccy)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatMoney(Number(l.amount), ccy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {dn.reason || dn.customerNotes || dn.termsAndConditions ? (
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            {dn.reason ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reason
                </div>
                <div>{dn.reason}</div>
              </div>
            ) : null}
            {dn.customerNotes ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Customer notes
                </div>
                <div className="whitespace-pre-line">{dn.customerNotes}</div>
              </div>
            ) : null}
            {dn.termsAndConditions ? (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Terms &amp; Conditions
                </div>
                <div className="whitespace-pre-line">
                  {dn.termsAndConditions}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold mb-3">Activity</h2>
          <ActivityTimeline
            entries={auditLogs.map((a) => ({
              id: a.id,
              action: a.action,
              createdAt: a.createdAt,
              userName: a.user?.name ?? a.user?.email ?? null,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
