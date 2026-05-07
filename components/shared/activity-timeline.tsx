import * as React from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type ActivityEntry = {
  id: string;
  action: string;
  createdAt: Date;
  userName?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Activity timeline — renders AuditLog entries for a document. Used on
 * Quote / SalesOrder / Invoice / CreditNote detail pages so the merchant
 * can see the full history (created, sent, accepted, paid, etc.) without
 * leaving the page.
 */
export function ActivityTimeline({
  entries,
  emptyMessage = "No activity yet.",
}: {
  entries: ActivityEntry[];
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <ol className="space-y-3 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {e.action}
                  </Badge>
                  {e.userName ? (
                    <span className="text-xs text-muted-foreground">
                      by {e.userName}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {format(e.createdAt, "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
                {summarize(e.before, e.after) ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summarize(e.before, e.after)}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function summarize(_before: unknown, after: unknown): string | null {
  // Cheap human-readable summary of the JSON `after` payload. We don't
  // diff against `before` yet; reserved for future enhancement.
  if (!after) return null;
  try {
    const a = after as Record<string, unknown>;
    const parts: string[] = [];
    if (a.status) parts.push(`status → ${String(a.status)}`);
    if (a.total !== undefined) parts.push(`total ${String(a.total)}`);
    if (a.amountReceived !== undefined)
      parts.push(`amount received ${String(a.amountReceived)}`);
    if (a.creditApplied) parts.push(`credit applied ${String(a.creditApplied)}`);
    if (a.refunded) parts.push("refunded");
    return parts.length > 0 ? parts.join(" · ") : null;
  } catch {
    return null;
  }
}
