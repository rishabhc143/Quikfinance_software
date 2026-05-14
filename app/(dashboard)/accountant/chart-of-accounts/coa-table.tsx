"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  MoreHorizontal,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  archiveAccountByIdAction,
  restoreAccountByIdAction,
  bulkArchiveAccountsAction,
  bulkRestoreAccountsAction,
} from "./actions";

type Row = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  subType: string | null;
  parentName: string | null;
  parentCode: string | null;
  isActive: boolean;
  description: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/**
 * ACCT-E.2 — Bulk-aware Chart of Accounts table.
 *
 * Renders the 5-column Zoho layout (Name · Code · Type · Documents
 * · Parent) plus a leading checkbox + trailing ⚙ dropdown per row.
 *
 * Bulk select shows a toolbar above the table with Archive /
 * Restore actions. SYS-* rows have a lock icon instead of a
 * checkbox and are silently skipped by the bulk-archive action.
 *
 * Account names are clickable links to `/[id]` (the detail page
 * from ACCT-E).
 */
export function CoaTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  // Selectable rows are user accounts (no SYS- prefix). SYS-* are
  // displayed with a lock icon and can't be checked.
  const selectableIds = React.useMemo(
    () => rows.filter((r) => !r.code?.startsWith("SYS-")).map((r) => r.id),
    [rows]
  );
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected =
    !allSelected && selectableIds.some((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  }
  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulk(kind: "archive" | "restore") {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const res =
        kind === "archive"
          ? await bulkArchiveAccountsAction(ids)
          : await bulkRestoreAccountsAction(ids);
      if (!res.ok) {
        toast.error(res.error ?? "Bulk action failed");
      } else {
        const pieces: string[] = [];
        pieces.push(
          `${res.changed} account${res.changed === 1 ? "" : "s"} ${kind === "archive" ? "archived" : "restored"}`
        );
        if (res.refused > 0) {
          pieces.push(`${res.refused} skipped (system)`);
        }
        toast.success(pieces.join(" · "));
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRowArchive(id: string, isActive: boolean) {
    setBusy(true);
    try {
      if (isActive) {
        await archiveAccountByIdAction(id);
        toast.success("Account archived");
      } else {
        await restoreAccountByIdAction(id);
        toast.success("Account restored");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Bulk toolbar — appears when ≥ 1 selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <span className="font-medium">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleBulk("archive")}
              disabled={busy}
            >
              <Archive className="h-3.5 w-3.5 mr-1" />
              Archive
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleBulk("restore")}
              disabled={busy}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restore
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={busy}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  aria-label="Select all rows"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                />
              </th>
              <th className="text-left p-3">Account Name</th>
              <th className="text-left p-3">Account Code</th>
              <th className="text-left p-3">Account Type</th>
              <th className="text-left p-3">Documents</th>
              <th className="text-left p-3">Parent Account Name</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  No accounts match your filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isSys = r.code?.startsWith("SYS-") ?? false;
                return (
                  <tr
                    key={r.id}
                    className={
                      "hover:bg-muted/30 " + (!r.isActive ? "opacity-60" : "")
                    }
                  >
                    <td className="p-3">
                      {isSys ? (
                        <Lock
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-label="System account (locked)"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer"
                          aria-label={`Select ${r.name}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/accountant/chart-of-accounts/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      {!r.isActive && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] ml-2"
                        >
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {r.code ?? "—"}
                    </td>
                    <td className="p-3 text-xs">
                      {r.subType ?? TYPE_LABEL[r.type] ?? r.type}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">—</td>
                    <td className="p-3 text-xs">
                      {r.parentName ? (
                        <span className="text-muted-foreground">
                          {r.parentCode ? `${r.parentCode} · ` : ""}
                          {r.parentName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {isSys ? null : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Open actions for ${r.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/accountant/chart-of-accounts/${r.id}/edit`}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            {r.isActive ? (
                              <DropdownMenuItem
                                onClick={() => handleRowArchive(r.id, true)}
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleRowArchive(r.id, false)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
