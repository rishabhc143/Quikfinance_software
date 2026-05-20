"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Plus,
  MoreHorizontal,
  Download,
  Upload,
  Calendar,
  User as UserIcon,
  FolderOpen,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { StartTimerDialog } from "../projects/start-timer-dialog";
import { NewLogEntryDialog } from "./new-log-entry-dialog";
import { ExportTimesheetsDialog } from "./export-dialog";
import { ExportCurrentViewDialog } from "./export-current-view-dialog";

type ProjectOption = {
  id: string;
  name: string;
  tasks: { id: string; name: string; billable: boolean }[];
};
type CustomerOption = { id: string; name: string };
type MemberOption = { id: string; name: string; email: string };

const SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Timesheets" },
  { value: "my", label: "My Timesheets" },
  { value: "billable", label: "Billable" },
  { value: "non-billable", label: "Non-billable" },
];

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-year", label: "This Year" },
];

/**
 * Top toolbar + filter strip for /time/entries (Timesheet).
 *
 * Matches the reference screenshot:
 *   [All Timesheets ▾]                          [Start] [+ New Log Entry ▾] [⋯]
 *   VIEW BY: Period: All ▾ | Customer ▾ | Project ▾ | User ▾
 *
 * Filter writes go to URL params. The server page re-renders the table
 * with the filtered query.
 */
export function TimesheetToolbar({
  scope,
  period,
  customerId,
  projectId,
  userId,
  projects,
  customers,
  members,
  currentUser,
}: {
  scope: string;
  period: string;
  customerId: string;
  projectId: string;
  userId: string;
  projects: ProjectOption[];
  customers: CustomerOption[];
  members: MemberOption[];
  currentUser: MemberOption;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (value === null || value === "" || value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/time/entries?${qs}` : "/time/entries");
  }

  const activeScope =
    SCOPE_OPTIONS.find((o) => o.value === scope) ?? SCOPE_OPTIONS[0];
  const activePeriod =
    PERIOD_OPTIONS.find((o) => o.value === period) ?? PERIOD_OPTIONS[0];
  const activeCustomer =
    customers.find((c) => c.id === customerId) ?? null;
  const activeProject = projects.find((p) => p.id === projectId) ?? null;
  const activeUser = members.find((m) => m.id === userId) ?? null;

  // Projects list trimmed for the Start Timer modal (id+name+tasks already in shape).
  const startTimerProjects = projects;

  return (
    <div>
      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-3 border-b pb-3 mb-3">
        {/* Left: scope filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-lg font-semibold hover:text-blue-600 transition-colors"
            >
              {activeScope.label}
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Filter timesheets
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SCOPE_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => setParam("scope", o.value)}
                className={
                  o.value === activeScope.value ? "font-semibold text-blue-600" : ""
                }
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <StartTimerDialog projects={startTimerProjects} />

          {/* Split + New Log Entry button */}
          <div className="inline-flex">
            <NewLogEntryDialog
              projects={projects}
              members={members}
              currentUser={currentUser}
              trigger={
                <Button
                  size="sm"
                  className="rounded-r-none gap-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Log Entry
                </Button>
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-blue-700/40 px-2 bg-blue-600 hover:bg-blue-700"
                  aria-label="More log-entry options"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link href="/time/entries/new">Full entry form</Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  Bulk add multiple
                  <span className="ml-2 text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm">
                    Soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 3-dot — Import / Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {/* Import submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Download className="h-3.5 w-3.5 mr-2 text-blue-600" />
                  Import
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                    Import from CSV
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/time/entries/import">Import Timesheets</Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Export submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Upload className="h-3.5 w-3.5 mr-2 text-blue-600" />
                  Export
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                    Export to file
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <ExportTimesheetsDialog
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Export Timesheets
                      </DropdownMenuItem>
                    }
                  />
                  <ExportCurrentViewDialog
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        Export Current View
                      </DropdownMenuItem>
                    }
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filter strip */}
      <div className="flex items-center gap-1 text-sm bg-muted/20 border rounded-md px-3 py-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium mr-1">
          View by:
        </span>

        {/* Period */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-background"
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Period:</span>
              <span className="font-medium">{activePeriod.label}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PERIOD_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => setParam("period", o.value)}
                className={
                  o.value === activePeriod.value ? "font-semibold text-blue-600" : ""
                }
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground/40">|</span>

        {/* Customer */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-background"
            >
              <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={activeCustomer ? "font-medium" : "text-muted-foreground"}>
                {activeCustomer?.name ?? "Select customer"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setParam("customerId", null)}>
              All customers
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {customers.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No customers yet
              </div>
            ) : (
              customers.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => setParam("customerId", c.id)}
                  className={c.id === customerId ? "font-semibold text-blue-600" : ""}
                >
                  {c.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground/40">|</span>

        {/* Project */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-background"
            >
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={activeProject ? "font-medium" : "text-muted-foreground"}>
                {activeProject?.name ?? "Select a project"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setParam("projectId", null)}>
              All projects
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No projects yet
              </div>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => setParam("projectId", p.id)}
                  className={p.id === projectId ? "font-semibold text-blue-600" : ""}
                >
                  {p.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground/40">|</span>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-background"
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={activeUser ? "font-medium" : "text-muted-foreground"}>
                {activeUser?.name ?? "Select user"}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem onSelect={() => setParam("userId", null)}>
              All users
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {members.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => setParam("userId", m.id)}
                className={m.id === userId ? "font-semibold text-blue-600" : ""}
              >
                {m.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
