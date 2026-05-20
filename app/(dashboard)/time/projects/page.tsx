import Link from "next/link";
import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import {
  User,
  ClipboardList,
  Timer,
  Receipt,
  FileText,
  Smartphone,
  Apple,
  Monitor,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { formatMoney } from "@/lib/money";
import { ProjectsToolbar } from "./projects-toolbar";

export const metadata = { title: "Projects" };

const COLUMNS: ColumnDef[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "customer", header: "Customer" },
  { key: "status", header: "Status" },
  { key: "budget", header: "Budget", align: "right" },
  { key: "startDate", header: "Start" },
  { key: "endDate", header: "End" },
];

const VALID_STATUSES = new Set(["active", "inactive", "completed", "cancelled"]);

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const q = (searchParams.q ?? "").trim();
  const statusParam = (searchParams.status ?? "all").toLowerCase();
  const statusFilter = VALID_STATUSES.has(statusParam) ? statusParam : "all";
  const sort = ["name", "startDate", "createdAt"].includes(searchParams.sort ?? "")
    ? searchParams.sort!
    : "name";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = 25;

  const where: Prisma.ProjectWhereInput = {
    organizationId: organization.id,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  };

  const [total, rows, totalUnfiltered] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    // Used to decide between empty state and "no results for filter"
    db.project.count({ where: { organizationId: organization.id } }),
  ]);

  const customerIds = Array.from(
    new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])
  );
  const customers =
    customerIds.length > 0
      ? await db.contact.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, displayName: true },
        })
      : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.displayName]));

  const dataRows = rows.map((p) => ({
    id: p.id,
    href: `/time/projects/${p.id}`,
    cells: [
      <span key="n" className="font-medium">
        {p.name}
      </span>,
      p.customerId ? customerMap.get(p.customerId) ?? "—" : "—",
      <Badge key="s" variant={p.status === "active" ? "success" : "outline"}>
        {p.status.replace("_", " ")}
      </Badge>,
      p.budget ? formatMoney(Number(p.budget), cur) : "—",
      p.startDate ? format(p.startDate, "dd MMM yyyy") : "—",
      p.endDate ? format(p.endDate, "dd MMM yyyy") : "—",
    ],
  }));

  // Empty-state if the org has no projects at all (regardless of filter).
  const showOnboarding = totalUnfiltered === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ProjectsToolbar status={statusFilter} />

      {showOnboarding ? (
        <ProjectsOnboarding />
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
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Empty / onboarding state — shown when the org has no projects yet.
// Matches the reference layout: hero video → CTA → lifecycle infographic
// → "Do more than just Project Time Tracking" feature highlights.
// ─────────────────────────────────────────────────────────────────────────

function ProjectsOnboarding() {
  return (
    <div className="space-y-12 py-8">
      {/* Hero: CTA */}
      <div className="flex flex-col items-center text-center max-w-xl mx-auto">
        <h2 className="text-2xl font-semibold">Create your first project</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Keep track of time you spend on various projects.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-6 bg-blue-600 hover:bg-blue-700 uppercase tracking-wide"
        >
          <Link href="/time/projects/new">Create New Project</Link>
        </Button>
      </div>

      {/* Separator */}
      <div className="border-t" />

      {/* Lifecycle infographic */}
      <LifecycleDiagram />

      {/* Separator */}
      <div className="border-t" />

      {/* Do more than just Project Time Tracking */}
      <DoMoreSection />
    </div>
  );
}

function LifecycleDiagram() {
  // Reference layout shows 5 nodes:
  //   Customer  →  Project  →  [Log Time / Project Expense]  →  Invoices
  //                    ↑                                          ↑
  //                    └──────── Retainer Invoices ───────────────┘
  //
  // Rendered as a horizontal flow with a top "Retainer Invoices" node
  // that branches from Project and reconnects to Invoices via dashed
  // borders on the grid.
  return (
    <div>
      <h3 className="text-center text-lg font-semibold mb-8">Life cycle of a Project</h3>

      <div className="relative mx-auto max-w-4xl px-4">
        {/* Top row: Retainer Invoices node */}
        <div className="flex justify-center mb-4">
          <Node icon={FileText} label="Retainer Invoices" tone="blue" />
        </div>

        {/* Dashed bracket above middle row connecting Project → Retainer → Invoices */}
        <div className="relative h-6 mb-2">
          <div className="absolute left-[28%] right-[28%] top-0 border-t border-dashed border-slate-300 dark:border-slate-700" />
          <div className="absolute left-[28%] top-0 h-full border-l border-dashed border-slate-300 dark:border-slate-700" />
          <div className="absolute right-[28%] top-0 h-full border-r border-dashed border-slate-300 dark:border-slate-700" />
        </div>

        {/* Middle row: Customer → Project → (Log Time / Project Expense) → Invoices */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-2">
          <Node icon={User} label="Customer" tone="blue" />
          <Connector />
          <Node icon={ClipboardList} label="Project" tone="blue" />
          <Connector />
          <div className="flex flex-col gap-3">
            <Node icon={Timer} label="Log Time Using Timer" tone="purple" />
            <Node icon={Receipt} label="Project Expense" tone="blue" />
          </div>
          <Connector />
          <Node icon={FileText} label="Invoices" tone="blue" />
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
  tone: "blue" | "purple";
}) {
  const iconColor =
    tone === "purple"
      ? "text-purple-500"
      : "text-blue-500";
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm">
      <Icon className={`h-4 w-4 ${iconColor}`} />
      <span className="text-[11px] uppercase tracking-wider font-medium whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div className="border-t border-dashed border-slate-300 dark:border-slate-700 w-full" />
  );
}

function DoMoreSection() {
  const bullets = [
    "Log time spent on projects",
    "Invite staff and assign project tasks",
    "Set budget for projects",
    "Manage projects and associated project tasks",
  ];

  return (
    <div className="max-w-5xl mx-auto px-4">
      <h3 className="text-center text-lg font-medium mb-8 text-muted-foreground">
        Do more than just Project Time Tracking
      </h3>

      <div className="grid gap-10 md:grid-cols-2">
        {/* Left: feature bullets */}
        <div className="space-y-3">
          {bullets.map((b) => (
            <div key={b} className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <span className="text-sm">{b}</span>
            </div>
          ))}
          <Link
            href="/help/time-tracking-guide"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-4"
          >
            Learn More
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Right: mobile/extension copy */}
        <div>
          <h4 className="text-sm font-semibold">Track Time and Projects Effortlessly</h4>
          <p className="text-sm text-muted-foreground mt-2">
            Manage your invoices, quotes, track payments and upload expense receipts right from
            your phone. Or maybe your tablet!
          </p>
          <div className="flex items-center gap-3 mt-4 text-muted-foreground">
            <Smartphone className="h-5 w-5" aria-label="Mobile" />
            <Apple className="h-5 w-5" aria-label="iOS" />
            <Monitor className="h-5 w-5" aria-label="Desktop" />
          </div>
          <div className="border-t my-4" />
          <div className="text-xs text-muted-foreground">
            Tip: log time on the go — mobile apps for Quikfinance are coming soon.
          </div>
        </div>
      </div>
    </div>
  );
}
