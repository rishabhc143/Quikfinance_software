"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * REPORTS — Error boundary for the Profit and Loss (Schedule III)
 * route. Catches any server-component render error and surfaces the
 * digest + a Try again button. The actual exception is logged
 * to Vercel function logs.
 */
export default function ProfitLossScheduleIIIError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[reports/profit-loss-schedule-iii] render error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center space-y-4">
        <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
        <h1 className="text-xl font-semibold">
          Couldn&apos;t load Profit and Loss (Schedule III)
        </h1>
        <p className="text-sm text-muted-foreground">
          The Schedule III report ran into an error while rendering. The
          team has been notified. In the meantime, you can return to the
          Reports Center or open the regular Profit and Loss report.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            ref: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/reports/profit-loss">Open regular P&amp;L</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/reports">Reports Center</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
