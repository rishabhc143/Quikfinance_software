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
  Settings,
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
import { StartTimerDialog } from "./start-timer-dialog";

/**
 * Top toolbar for /time/projects — matches the reference layout:
 *   [All Projects ▾]               [Start] [+ New ▾] [⋯]
 *
 * - "All Projects ▾"   filter by status. Writes `?status=…` to URL.
 * - "Start"            quick-start a timer → /time/entries/new
 * - "+ New ▾"          split-button: primary opens new-project form;
 *                       caret opens a small menu (New Project / New Task)
 * - "⋯"                 3-dot menu (Sort / Refresh / Import — stub)
 *
 * Note: no list/card view toggle by design — projects are always shown
 * as a table for clarity.
 */
export function ProjectsToolbar({
  status,
  projects,
}: {
  status: string;
  projects: {
    id: string;
    name: string;
    tasks: { id: string; name: string; billable: boolean }[];
  }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: "all", label: "All Projects" },
    { value: "active", label: "Active Projects" },
    { value: "inactive", label: "Inactive Projects" },
    { value: "completed", label: "Completed Projects" },
    { value: "cancelled", label: "Cancelled Projects" },
  ];

  const activeStatus = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];

  function applyStatus(next: string) {
    const params = new URLSearchParams(sp.toString());
    if (next === "all") params.delete("status");
    else params.set("status", next);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/time/projects?${qs}` : "/time/projects");
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3 mb-4">
      {/* Left: status filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-lg font-semibold hover:text-blue-600 transition-colors"
          >
            {activeStatus.label}
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
            Filter projects
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => applyStatus(o.value)}
              className={o.value === activeStatus.value ? "font-semibold text-blue-600" : ""}
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <StartTimerDialog projects={projects} />

        {/* Split + New button */}
        <div className="inline-flex">
          <Button
            asChild
            size="sm"
            className="rounded-r-none gap-1 bg-blue-600 hover:bg-blue-700"
          >
            <Link href="/time/projects/new">
              <Plus className="h-3.5 w-3.5" />
              New
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="rounded-l-none border-l border-blue-700/40 px-2 bg-blue-600 hover:bg-blue-700"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem asChild>
                <Link href="/time/projects/new">New Project</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/time/entries/new">Log Time</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 3-dot menu — Import / Export / Preferences */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
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
                  <Link href="/time/projects/import">Import Projects</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/time/projects/import?type=tasks">Import Tasks</Link>
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
                  Export to CSV
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/time/projects/export" download>
                    Export Projects
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`/time/projects/export?${new URLSearchParams(
                      sp.toString()
                    ).toString()}`}
                    download
                  >
                    Export Current View
                  </a>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Preferences — direct link */}
            <DropdownMenuItem asChild>
              <Link href="/settings/modules/timesheet">
                <Settings className="h-3.5 w-3.5 mr-2 text-blue-600" />
                Preferences
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
