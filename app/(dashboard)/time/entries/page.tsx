import Link from "next/link";
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";
import {
  FolderOpen,
  FileSpreadsheet,
  Clock,
  ReceiptText,
  FileText,
  CircleDollarSign,
  FileX,
  CheckCircle2,
  Smartphone,
  Apple,
  Monitor,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { TimesheetToolbar } from "./timesheet-toolbar";
import { NewLogEntryDialog } from "./new-log-entry-dialog";

export const metadata = { title: "Timesheet" };

const COLUMNS: ColumnDef[] = [
  { key: "date", header: "Date", sortable: true },
  { key: "project", header: "Project" },
  { key: "task", header: "Task" },
  { key: "user", header: "User" },
  { key: "description", header: "Notes" },
  { key: "hours", header: "Hours", align: "right" },
  { key: "billable", header: "Billable", align: "center" },
  { key: "billed", header: "Billed", align: "center" },
];

const VALID_SCOPES = new Set(["all", "my", "billable", "non-billable"]);
const VALID_PERIODS = new Set([
  "all",
  "today",
  "this-week",
  "this-month",
  "this-year",
]);

function rangeForPeriod(period: string): { gte?: Date; lte?: Date } {
  const now = new Date();
  switch (period) {
    case "today":
      return { gte: startOfDay(now), lte: endOfDay(now) };
    case "this-week":
      return { gte: startOfWeek(now, { weekStartsOn: 1 }), lte: endOfDay(now) };
    case "this-month":
      return { gte: startOfMonth(now), lte: endOfDay(now) };
    case "this-year":
      return { gte: startOfYear(now), lte: endOfDay(now) };
    default:
      return {};
  }
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { user, organization } = await requireOrganization();

  const scope = VALID_SCOPES.has(searchParams.scope ?? "")
    ? (searchParams.scope as string)
    : "all";
  const period = VALID_PERIODS.has(searchParams.period ?? "")
    ? (searchParams.period as string)
    : "all";
  const customerId = (searchParams.customerId ?? "").trim();
  const projectId = (searchParams.projectId ?? "").trim();
  const userId = (searchParams.userId ?? "").trim();
  const q = (searchParams.q ?? "").trim();

  const sort = ["date", "hours"].includes(searchParams.sort ?? "")
    ? searchParams.sort!
    : "date";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  // ── Build the WHERE clause from URL filters ─────────────────────────
  const dateRange = rangeForPeriod(period);

  // For customerId: filter time entries whose project belongs to that customer.
  const projectFilter: Prisma.ProjectWhereInput | undefined =
    customerId ? { customerId } : undefined;

  const where: Prisma.TimeEntryWhereInput = {
    organizationId: organization.id,
    ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
    ...(dateRange.gte ? { date: { gte: dateRange.gte, lte: dateRange.lte } } : {}),
    ...(projectId ? { projectId } : {}),
    ...(userId ? { userId } : {}),
    ...(scope === "my" ? { userId: user.id } : {}),
    ...(scope === "billable" ? { OR: [{ billable: true }] } : {}),
    ...(scope === "non-billable" ? { billable: false } : {}),
    ...(projectFilter ? { project: projectFilter } : {}),
  };

  // ── Fetch entries + supporting picker data in parallel ──────────────
  const [total, rows, totalUnfiltered, allProjects, allCustomers, allMembers] =
    await Promise.all([
      db.timeEntry.count({ where }),
      db.timeEntry.findMany({
        where,
        orderBy: { [sort]: dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true } },
          task: { select: { id: true, name: true } },
        },
      }),
      db.timeEntry.count({ where: { organizationId: organization.id } }),
      db.project.findMany({
        where: {
          organizationId: organization.id,
          status: { in: ["active", "on_hold"] },
        },
        select: {
          id: true,
          name: true,
          tasks: {
            select: { id: true, name: true, billable: true },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      db.contact.findMany({
        where: {
          organizationId: organization.id,
          deletedAt: null,
          type: { in: ["CUSTOMER", "BOTH"] },
        },
        select: { id: true, displayName: true },
        orderBy: { displayName: "asc" },
      }),
      db.organizationMembership.findMany({
        where: { organizationId: organization.id },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

  // Hydrate user names for table rows
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const userMap = new Map(
    allMembers
      .filter((m) => userIds.includes(m.user.id))
      .map((m) => [
        m.user.id,
        m.user.name?.trim() || m.user.email.split("@")[0],
      ])
  );

  const customers = allCustomers.map((c) => ({ id: c.id, name: c.displayName }));
  const members = allMembers
    .filter((m) => m.user != null)
    .map((m) => ({
      id: m.user.id,
      name: m.user.name?.trim() || m.user.email.split("@")[0],
      email: m.user.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const currentUser = {
    id: user.id,
    name: user.name?.trim() || user.email.split("@")[0],
    email: user.email,
  };

  const dataRows = rows.map((e) => ({
    id: e.id,
    cells: [
      format(e.date, "dd MMM yyyy"),
      <span key="p" className="font-medium">
        {e.project?.name ?? "—"}
      </span>,
      e.task?.name ?? <span className="text-muted-foreground">—</span>,
      <span key="u" className="text-muted-foreground text-xs">
        {userMap.get(e.userId) ?? "—"}
      </span>,
      e.description ?? <span className="text-muted-foreground">—</span>,
      Number(e.hours).toFixed(2),
      e.billable === false ? (
        <span key="nb" className="text-muted-foreground text-xs">
          —
        </span>
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 inline-block" />
      ),
      e.isBilled ? (
        <Badge key="b" variant="success">
          Billed
        </Badge>
      ) : (
        <span key="b" className="text-muted-foreground text-xs">
          Unbilled
        </span>
      ),
    ],
  }));

  const showOnboarding = totalUnfiltered === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <TimesheetToolbar
        scope={scope}
        period={period}
        customerId={customerId}
        projectId={projectId}
        userId={userId}
        projects={allProjects}
        customers={customers}
        members={members}
        currentUser={currentUser}
      />

      <div className="mt-4">
        {showOnboarding ? (
          <TimesheetOnboarding
            projects={allProjects}
            members={members}
            currentUser={currentUser}
          />
        ) : (
          <DataTable
            rows={dataRows}
            columns={COLUMNS}
            total={total}
            page={page}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            search={q}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Empty / onboarding state — shown when the org has no time entries yet
// ─────────────────────────────────────────────────────────────────────────

function TimesheetOnboarding({
  projects,
  members,
  currentUser,
}: {
  projects: {
    id: string;
    name: string;
    tasks: { id: string; name: string; billable: boolean }[];
  }[];
  members: { id: string; name: string; email: string }[];
  currentUser: { id: string; name: string; email: string };
}) {
  return (
    <div className="space-y-12 py-8">
      {/* Hero CTA */}
      <div className="flex flex-col items-center text-center max-w-xl mx-auto">
        <h2 className="text-2xl font-semibold">Create your first time entry</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Log the time spent on project tasks and charge your customers
          accordingly.
        </p>
        <div className="mt-6">
          <NewLogEntryDialog
            projects={projects}
            members={members}
            currentUser={currentUser}
            trigger={
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 uppercase tracking-wide"
              >
                Log Time
              </Button>
            }
          />
        </div>
      </div>

      <div className="border-t" />

      {/* Lifecycle */}
      <LifecycleDiagram />

      <div className="border-t" />

      {/* In the Timesheets module, you can */}
      <FeaturesSection />
    </div>
  );
}

function LifecycleDiagram() {
  return (
    <div>
      <h3 className="text-center text-lg font-semibold mb-8">
        Life cycle of a Timesheet
      </h3>
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Node icon={FolderOpen} label="Project" />
          <Connector />
          <Node icon={FileSpreadsheet} label="Time Sheet" />
          <Connector />
          <Node icon={Clock} label="Log Time For Tasks" tone="purple" />
          <Connector />
          {/* Branch */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Node icon={ReceiptText} label="Billable" tone="green" />
              <Connector />
              <Node icon={FileText} label="Include Time Entries In Invoice" />
              <Connector />
              <Node icon={CircleDollarSign} label="Get Paid" tone="green" />
            </div>
            <div className="flex items-center gap-2">
              <Node icon={FileX} label="Non-Billable" tone="red" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Node({
  icon: Icon,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "purple" | "green" | "red";
}) {
  const iconColor =
    tone === "purple"
      ? "text-purple-500"
      : tone === "green"
        ? "text-emerald-600"
        : tone === "red"
          ? "text-rose-500"
          : "text-blue-500";
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm shrink-0">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <span className="text-[11px] uppercase tracking-wider font-medium whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div className="border-t border-dashed border-slate-300 dark:border-slate-700 w-6 shrink-0" />
  );
}

function FeaturesSection() {
  const bullets = [
    "Create time entries for the project tasks.",
    "Log time for a single day or an entire week.",
    "Start and stop the timer to log time for project tasks.",
  ];

  return (
    <div className="max-w-3xl mx-auto px-4">
      <h3 className="text-center text-base font-semibold mb-6">
        In the Timesheets module, you can:
      </h3>
      <div className="space-y-3 max-w-xl mx-auto">
        {bullets.map((b) => (
          <div key={b} className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <span className="text-sm">{b}</span>
          </div>
        ))}
      </div>
      <div className="mt-10 pt-6 border-t text-center">
        <p className="text-sm text-muted-foreground">
          Log time and manage your timesheet entries right from your smartphone
          or tablet.
        </p>
        <div className="flex items-center justify-center gap-3 mt-3 text-muted-foreground">
          <Smartphone className="h-5 w-5" aria-label="Mobile" />
          <Apple className="h-5 w-5" aria-label="iOS" />
          <Monitor className="h-5 w-5" aria-label="Desktop" />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Mobile apps for Quikfinance are coming soon.
        </p>
      </div>
    </div>
  );
}

// Unused import suppression for Link (kept in case we surface customer-create later)
void Link;
