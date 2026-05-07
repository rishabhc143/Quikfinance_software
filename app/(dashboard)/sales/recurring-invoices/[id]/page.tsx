import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import {
  pauseRecurringInvoiceAction,
  resumeRecurringInvoiceAction,
  stopRecurringInvoiceAction,
  runRecurringNowAction,
  deleteRecurringInvoiceAction,
} from "../actions";
import { RecurringActionButton } from "./action-button";

export default async function RecurringDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const r = await db.recurringInvoice.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      generatedInvoices: { orderBy: { issueDate: "desc" }, take: 25 },
      occurrences: { orderBy: { occurrenceDate: "desc" }, take: 25 },
    },
  });
  if (!r) notFound();

  const ccy = organization.currency;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/sales/recurring-invoices">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">{r.profileName}</h1>
          <Badge variant={r.status === "ACTIVE" ? "secondary" : "outline"}>
            {r.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {r.status === "ACTIVE" ? (
            <RecurringActionButton
              action={pauseRecurringInvoiceAction.bind(null, r.id)}
              label="Pause"
              variant="outline"
            />
          ) : null}
          {r.status === "PAUSED" ? (
            <RecurringActionButton
              action={resumeRecurringInvoiceAction.bind(null, r.id)}
              label="Resume"
            />
          ) : null}
          {r.status === "ACTIVE" ? (
            <RecurringActionButton
              action={runRecurringNowAction.bind(null, r.id)}
              label="Run now"
            />
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/sales/recurring-invoices/${r.id}/edit`}>Edit</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {r.status !== "STOPPED" ? (
                <DropdownMenuItem asChild>
                  <form action={stopRecurringInvoiceAction.bind(null, r.id)}>
                    <button type="submit" className="w-full text-left">Stop</button>
                  </form>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={deleteRecurringInvoiceAction.bind(null, r.id)}
            confirmText="Delete this recurring profile?"
            redirectTo="/sales/recurring-invoices"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <Link href={`/sales/customers/${r.contactId}`} className="hover:underline font-medium">
                {r.contact.displayName}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frequency</span>
              <span>
                {r.frequency === "EVERY_N_MONTHS" ? `Every ${r.intervalN} months` : r.frequency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start date</span>
              <span>{format(r.startDate, "dd MMM yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End date</span>
              <span>
                {r.neverExpires ? "Never" : r.endDate ? format(r.endDate, "dd MMM yyyy") : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Next invoice date</span>
              <span>{format(r.nextOccurrenceDate, "dd MMM yyyy")}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount per occurrence</span>
              <span className="text-lg font-semibold">
                {formatMoney(Number(r.amount), ccy)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Occurrences generated</span>
              <span>{r.occurrencesGenerated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email automatically</span>
              <span>{r.emailAutomatically ? "Yes" : "No"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold mb-3">Generated invoices</h2>
          {r.generatedInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoices generated yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Number</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.generatedInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="p-2">{format(inv.issueDate, "dd MMM yyyy")}</td>
                    <td className="p-2 font-mono">
                      <Link href={`/sales/invoices/${inv.id}`} className="hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{inv.status}</Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(inv.total), ccy)}
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
