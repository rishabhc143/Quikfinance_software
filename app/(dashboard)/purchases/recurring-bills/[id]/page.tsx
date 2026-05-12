import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  Zap,
  Repeat,
} from "lucide-react";
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
import { ActionFormButton } from "@/components/shared/action-form-button";
import { DeleteButton } from "@/components/shared/delete-button";
import { formatMoney } from "@/lib/money";
import { computeNextOccurrence } from "@/lib/purchases/recurring";
import {
  pauseRecurringBillAction,
  resumeRecurringBillAction,
  stopRecurringBillAction,
  runRecurringBillNowAction,
  deleteRecurringBillAction,
} from "../actions";

export const metadata = { title: "Recurring Bill" };

const STATUS_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  ACTIVE: "secondary",
  PAUSED: "outline",
  EXPIRED: "outline",
  STOPPED: "destructive",
};

export default async function RecurringBillDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { organization } = await requireOrganization();
  const profile = await db.recurringBill.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      deletedAt: null,
    },
    include: {
      contact: { select: { id: true, displayName: true, email: true } },
      generatedBills: {
        where: { deletedAt: null },
        orderBy: { issueDate: "desc" },
        take: 25,
        select: {
          id: true,
          number: true,
          issueDate: true,
          dueDate: true,
          total: true,
          status: true,
        },
      },
    },
  });
  if (!profile) notFound();

  const cur = organization.currency;
  const isActive = profile.status === "ACTIVE";
  const isPaused = profile.status === "PAUSED";
  const isStopped = profile.status === "STOPPED";
  const isExpired = profile.status === "EXPIRED";

  // Compute next 5 occurrences inline (cheaper than another server
  // action roundtrip for a small read).
  const upcoming: Date[] = [];
  if (isActive) {
    let cursor = profile.nextRunAt;
    for (let i = 0; i < 5; i += 1) {
      upcoming.push(cursor);
      cursor = computeNextOccurrence(
        cursor,
        profile.frequency,
        profile.intervalN
      );
      if (
        !profile.neverExpires &&
        profile.endDate &&
        cursor > profile.endDate
      ) {
        break;
      }
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/recurring-bills" className="hover:underline">
          Recurring bills
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">{profile.profileName}</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/purchases/recurring-bills">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Repeat className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.profileName}
          </h1>
          <Badge variant={STATUS_VARIANT[profile.status] ?? "outline"}>
            {profile.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isActive ? (
            <ActionFormButton
              action={runRecurringBillNowAction.bind(null, profile.id)}
              label="Run Now"
              icon={<Zap className="h-4 w-4" />}
              successToast="Generated one Bill"
            />
          ) : null}
          {isActive ? (
            <ActionFormButton
              action={pauseRecurringBillAction.bind(null, profile.id)}
              label="Pause"
              icon={<Pause className="h-4 w-4" />}
              variant="outline"
              successToast="Profile paused"
            />
          ) : null}
          {isPaused ? (
            <ActionFormButton
              action={resumeRecurringBillAction.bind(null, profile.id)}
              label="Resume"
              icon={<Play className="h-4 w-4" />}
              successToast="Profile resumed"
            />
          ) : null}
          {!isStopped ? (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link href={`/purchases/recurring-bills/${profile.id}/edit`}>
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
              {!isStopped && !isExpired ? (
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="p-0"
                  asChild
                >
                  <div className="px-1 py-0.5 w-full">
                    <ActionFormButton
                      action={stopRecurringBillAction.bind(null, profile.id)}
                      label="Stop"
                      icon={<Square className="h-3.5 w-3.5" />}
                      variant="ghost"
                      size="sm"
                      successToast="Profile stopped"
                    />
                  </div>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <DeleteButton
            action={async () => {
              "use server";
              await deleteRecurringBillAction(profile.id);
            }}
            confirmText="Delete this recurring profile? Generated bills stay; only the schedule is removed."
            redirectTo="/purchases/recurring-bills"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vendor
            </div>
            <Link
              href={`/purchases/vendors/${profile.contact?.id}`}
              className="block font-medium hover:underline"
            >
              {profile.contact?.displayName ?? "—"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Cadence
            </div>
            <div>
              Every {profile.intervalN}{" "}
              <span className="capitalize">{profile.frequency}</span>
            </div>
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Next run
              </div>
              <div>
                {isActive
                  ? format(profile.nextRunAt, "dd MMM yyyy")
                  : `Paused`}
              </div>
            </div>
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Ends
              </div>
              <div>
                {profile.neverExpires
                  ? "Never expires"
                  : profile.endDate
                  ? format(profile.endDate, "dd MMM yyyy")
                  : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-right">
              Amount per cycle
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(Number(profile.amount), cur)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming runs preview */}
      {upcoming.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-semibold mb-3">
              Next {upcoming.length} run{upcoming.length === 1 ? "" : "s"}
            </h2>
            <ul className="space-y-1 text-sm">
              {upcoming.map((d, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between border-b pb-1 last:border-b-0"
                >
                  <span>{format(d, "EEE, dd MMM yyyy")}</span>
                  <span className="text-xs text-muted-foreground">
                    {i === 0 ? "Next" : `+${i} cycle${i === 1 ? "" : "s"}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Generated bills */}
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-sm font-semibold mb-3">
            Generated bills ({profile.generatedBills.length})
          </h2>
          {profile.generatedBills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No bills generated yet. The first one lands on{" "}
              <strong>{format(profile.nextRunAt, "dd MMM yyyy")}</strong>{" "}
              (or click <strong>Run Now</strong> to generate one
              immediately).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Issue date</th>
                  <th className="p-2">Bill #</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Due</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profile.generatedBills.map((b) => (
                  <tr key={b.id}>
                    <td className="p-2">
                      {format(b.issueDate, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 font-mono">
                      <Link
                        href={`/purchases/bills/${b.id}`}
                        className="hover:underline"
                      >
                        {b.number}
                      </Link>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {format(b.dueDate, "dd MMM yyyy")}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(Number(b.total), cur)}
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
