"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Home,
  Star,
  Users,
  User as UserIcon,
  Clock,
  Folder,
  Search,
  MoreVertical,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import {
  REPORTS,
  REPORT_CATEGORIES,
  findReport,
  type ReportCategory,
  type ReportEntry,
} from "@/lib/reports/catalog";
import {
  toggleReportFavoriteAction,
  deleteCustomReportAction,
} from "./actions";

/** A saved custom report, serialized for the client. */
export type CustomReportRow = {
  id: string;
  name: string;
  reportKey: string;
  params: string;
  createdAt: string;
};

/**
 * REPORTS-CENTER — client component for `/reports`.
 *
 *   - Left sidebar: Home / Favorites / (stubbed) Shared / My /
 *     Scheduled tabs, then the 15 Report Category folders.
 *   - Top header: title + centered search + "Create Custom Report"
 *     (disabled) + 3-dot menu.
 *   - Main panel: filtered table of catalog reports with per-row
 *     ☆ toggle.
 *
 * Filter pipeline: tab → category → search. Favorites tab restricts
 * to favorited keys; Shared/My/Scheduled show empty states only.
 */

type Tab = "home" | "favorites" | "shared" | "my" | "scheduled";

const TAB_LABEL: Record<Tab, string> = {
  home: "Home",
  favorites: "Favorites",
  shared: "Shared Reports",
  my: "My Reports",
  scheduled: "Scheduled Reports",
};

const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = {
  home: Home,
  favorites: Star,
  shared: Users,
  my: UserIcon,
  scheduled: Clock,
};

const STUB_EMPTY: Record<
  "shared" | "scheduled",
  { title: string; body: string }
> = {
  shared: {
    title: "No reports shared with you yet",
    body: "When teammates share a report with you, it'll show up here.",
  },
  scheduled: {
    title: "No scheduled reports",
    body: "Schedule a report to deliver via email on a recurring cadence — arriving soon.",
  },
};

export function ReportsCenter({
  initialFavorites,
  initialCustomReports = [],
}: {
  initialFavorites: string[];
  initialCustomReports?: CustomReportRow[];
}) {
  const [favorites, setFavorites] = React.useState<Set<string>>(
    () => new Set(initialFavorites)
  );
  const [customReports, setCustomReports] =
    React.useState<CustomReportRow[]>(initialCustomReports);
  // Deep-link support: "Save as Custom Report" pushes /reports?tab=my,
  // so seed the initial tab from the URL when it names a valid tab.
  const searchParams = useSearchParams();
  const initialTab = React.useMemo<Tab>(() => {
    const t = searchParams?.get("tab");
    return t === "favorites" ||
      t === "shared" ||
      t === "my" ||
      t === "scheduled"
      ? t
      : "home";
  }, [searchParams]);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [category, setCategory] = React.useState<ReportCategory | null>(null);
  const [search, setSearch] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  // "Create Custom Report" entry-point modal: pick a base report to
  // customize. Proceed navigates to that report (where the existing
  // Customize toolbar lets the user tailor it).
  const router = useRouter();
  const [customOpen, setCustomOpen] = React.useState(false);
  const [baseReportKey, setBaseReportKey] = React.useState<string | null>(null);

  // All catalog reports as dropdown options; "coming soon" (not yet
  // built) entries are labelled so the user knows they can't proceed.
  const customReportOptions = React.useMemo(
    () =>
      REPORTS.map((r) => ({
        value: r.key,
        label: r.available ? r.name : `${r.name} (coming soon)`,
        hint: r.category,
      })),
    [],
  );

  function onProceedCustomReport() {
    const r = REPORTS.find((x) => x.key === baseReportKey);
    if (!r) return;
    if (r.available && r.href) {
      setCustomOpen(false);
      router.push(r.href);
    } else {
      toast.error("That report isn't available yet — pick another.");
    }
  }

  const visibleReports = React.useMemo<ReportEntry[]>(() => {
    if (tab === "shared" || tab === "my" || tab === "scheduled") return [];
    let rows = [...REPORTS];
    if (tab === "favorites") {
      rows = rows.filter((r) => favorites.has(r.key));
    }
    if (category) {
      rows = rows.filter((r) => r.category === category);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [tab, favorites, category, search]);

  // "my" is now a real tab (renders saved custom reports below);
  // Shared + Scheduled remain coming-soon stubs.
  const isStubTab = tab === "shared" || tab === "scheduled";

  function deleteCustomReport(id: string) {
    // Optimistic — drop the row locally, then call the server.
    const prev = customReports;
    setCustomReports((rows) => rows.filter((r) => r.id !== id));
    startTransition(async () => {
      const res = await deleteCustomReportAction({ id });
      if (res.ok) {
        toast.success("Custom report deleted");
      } else {
        toast.error(res.error ?? "Couldn't delete custom report");
        setCustomReports(prev);
      }
    });
  }

  function toggleFavorite(key: string) {
    // Optimistic update — flip locally, then call the server.
    const prev = new Set(favorites);
    const next = new Set(favorites);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFavorites(next);
    startTransition(async () => {
      const res = await toggleReportFavoriteAction({ reportKey: key });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't update favorite");
        setFavorites(prev);
      }
    });
  }

  const headerTitle =
    tab === "home"
      ? category
        ? category
        : "All Reports"
      : TAB_LABEL[tab];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ── New Custom Report modal ─────────────────────────────── */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Custom Report</DialogTitle>
            <DialogDescription>
              Select the report that you want to customize and create a new
              custom report.
            </DialogDescription>
          </DialogHeader>
          <div className="py-1">
            <Combobox
              options={customReportOptions}
              value={baseReportKey}
              onChange={setBaseReportKey}
              placeholder="Select a Report"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={onProceedCustomReport}
              disabled={!baseReportKey}
            >
              Proceed
            </Button>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top header bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
        <h1 className="text-lg font-semibold">Reports Center</h1>
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports"
              className="pl-9 bg-muted/40 border-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCustomOpen(true)}>
            Create Custom Report
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  // No server data to refresh — just clear filters.
                  setSearch("");
                  setCategory(null);
                  setTab("home");
                  toast.success("Filters reset");
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Reset filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-muted/20">
        {/* ── Left sidebar ─────────────────────────────────────── */}
        <aside className="w-72 shrink-0 border-r bg-background overflow-y-auto">
          <nav className="p-3 space-y-0.5">
            {(["home", "favorites", "shared", "my", "scheduled"] as Tab[]).map(
              (t) => {
                const Icon = TAB_ICON[t];
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTab(t);
                      setCategory(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/50 text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{TAB_LABEL[t]}</span>
                  </button>
                );
              }
            )}
          </nav>

          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium pt-4">
            Report Category
          </div>
          <nav className="p-3 pt-1 space-y-0.5">
            {REPORT_CATEGORIES.map((c) => {
              const active = category === c && tab === "home";
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setTab("home");
                    setCategory((prev) => (prev === c ? null : c));
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/50 text-foreground"
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{c}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Main panel ───────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4">
          <div className="bg-background rounded-md border min-h-full">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <h2 className="text-lg font-semibold">{headerTitle}</h2>
              {isStubTab ? null : (
                <Badge variant="secondary" className="text-xs">
                  {tab === "my" ? customReports.length : visibleReports.length}
                </Badge>
              )}
            </div>

            {isStubTab ? (
              <div className="p-12 text-center space-y-2">
                <h3 className="text-sm font-medium">
                  {STUB_EMPTY[tab as keyof typeof STUB_EMPTY].title}
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {STUB_EMPTY[tab as keyof typeof STUB_EMPTY].body}
                </p>
              </div>
            ) : tab === "my" ? (
              customReports.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <h3 className="text-sm font-medium">No custom reports yet</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Open any report, tweak it, and click Save as Custom Report.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">Name</th>
                      <th className="text-left px-6 py-3 font-medium">
                        Base report
                      </th>
                      <th className="text-left px-6 py-3 font-medium">
                        Created
                      </th>
                      <th className="text-right px-6 py-3 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {customReports.map((entry) => {
                      const base = findReport(entry.reportKey);
                      const baseName = base?.name ?? entry.reportKey;
                      const href =
                        base?.available && base.href
                          ? `${base.href}${
                              entry.params ? `?${entry.params}` : ""
                            }`
                          : null;
                      return (
                        <tr key={entry.id} className="hover:bg-muted/20">
                          <td className="px-6 py-3">
                            {href ? (
                              <Link
                                href={href}
                                className="text-primary hover:underline"
                              >
                                {entry.name}
                              </Link>
                            ) : (
                              <span className="text-foreground">
                                {entry.name}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-foreground/80">
                            {baseName}
                          </td>
                          <td className="px-6 py-3 text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteCustomReport(entry.id)}
                              disabled={pending}
                              aria-label={`Delete ${entry.name}`}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : visibleReports.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                {tab === "favorites"
                  ? "No favorites yet — click the ☆ on any report to add it here."
                  : "No reports match the current filters."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">
                      Report Name
                    </th>
                    <th className="text-left px-6 py-3 font-medium">
                      Report Category
                    </th>
                    <th className="text-left px-6 py-3 font-medium">
                      Created By
                    </th>
                    <th className="text-left px-6 py-3 font-medium">
                      Last Visited
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleReports.map((r) => {
                    const fav = favorites.has(r.key);
                    return (
                      <tr
                        key={r.key}
                        className={cn(
                          "hover:bg-muted/20",
                          !r.available && "opacity-60"
                        )}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleFavorite(r.key)}
                              disabled={pending}
                              className="shrink-0 -ml-1 p-1 rounded hover:bg-muted/40"
                              aria-label={
                                fav
                                  ? `Unfavorite ${r.name}`
                                  : `Favorite ${r.name}`
                              }
                            >
                              <Star
                                className={cn(
                                  "h-4 w-4",
                                  fav
                                    ? "fill-yellow-400 text-yellow-500"
                                    : "text-muted-foreground"
                                )}
                              />
                            </button>
                            {r.available && r.href ? (
                              <Link
                                href={r.href}
                                className="text-primary hover:underline"
                              >
                                {r.name}
                              </Link>
                            ) : (
                              <>
                                <span className="text-muted-foreground">
                                  {r.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] uppercase tracking-wide ml-1"
                                >
                                  Coming soon
                                </Badge>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-foreground/80">
                          {r.category}
                        </td>
                        <td className="px-6 py-3 text-foreground/80">
                          System Generated
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
