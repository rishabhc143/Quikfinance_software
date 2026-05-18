"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import {
  markChecklistItemAction,
  unmarkChecklistItemAction,
} from "./actions";
import { cn } from "@/lib/utils";

/**
 * GETTING-STARTED — "Let's get you up and running" 2-pane checklist.
 *
 * Matches the Zoho screenshot:
 *   - Top: "Let's get you up and running" + "Mark as Completed" link
 *     + right-aligned progress bar with "X% Completed" text
 *   - Left rail (~280px): list of items, each with a ✓ or circle icon
 *     + label. Active item gets a left border highlight.
 *   - Right pane: header for the active item + body text +
 *     action buttons (CTA + secondary).
 */

export type ChecklistAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  /** Header in the right pane. Defaults to the label. */
  paneTitle?: string;
  /** Body text in the right pane. Supports plain string only. */
  paneBody: string;
  /** If item is auto-done via DB detection, show a green
   *  confirmation line above the actions. */
  autoDoneLine?: string | null;
  actions: ChecklistAction[];
};

export function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [activeKey, setActiveKey] = React.useState<string>(
    items[0]?.key ?? ""
  );
  const [pending, setPending] = React.useState(false);

  const active = items.find((i) => i.key === activeKey) ?? items[0];
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length
    ? Math.round((doneCount / items.length) * 100)
    : 0;

  async function markActive() {
    if (!active || pending) return;
    setPending(true);
    const res = active.done
      ? await unmarkChecklistItemAction(active.key)
      : await markChecklistItemAction(active.key);
    setPending(false);
    if (!res.ok) {
      // Best-effort surface; toast lib would be nicer but we don't
      // have it everywhere.
      window.alert(res.error);
      return;
    }
    router.refresh();
  }

  if (!active) return null;

  return (
    <div className="bg-background border rounded-lg overflow-hidden">
      {/* Top bar — title + Mark as Completed + progress */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">
            Let&apos;s get you up and running
          </h2>
          <button
            type="button"
            onClick={markActive}
            disabled={pending}
            className={cn(
              "text-xs px-2 py-1 rounded border",
              active.done
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-input hover:bg-muted/50"
            )}
          >
            {pending
              ? "Saving…"
              : active.done
                ? "✓ Marked Completed"
                : "Mark as Completed"}
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-40 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-emerald-700 font-medium">
            {pct}% Completed
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr] min-h-[280px]">
        {/* Left rail */}
        <div className="border-r py-2">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => setActiveKey(it.key)}
              className={cn(
                "w-full text-left flex items-center gap-2 px-5 py-3 text-sm",
                activeKey === it.key
                  ? "bg-background border-l-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30 border-l-2 border-transparent"
              )}
            >
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className="truncate">{it.label}</span>
            </button>
          ))}
        </div>

        {/* Right pane */}
        <div className="p-6 space-y-4">
          <h3 className="text-base font-semibold">
            {active.paneTitle ?? active.label}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {active.paneBody}
          </p>
          {active.autoDoneLine ? (
            <div className="text-sm text-emerald-700 font-medium">
              {active.autoDoneLine}
            </div>
          ) : null}
          <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
            {active.actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className={cn(
                  "inline-flex items-center gap-1 text-sm",
                  a.primary
                    ? "text-primary hover:underline font-medium"
                    : "text-foreground hover:text-primary"
                )}
              >
                {a.label}
                {a.primary ? <ArrowRight className="h-3 w-3" /> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
