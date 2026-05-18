"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for /getting-started. Catches any server-component
 * render error, logs the digest + stack to Vercel function logs,
 * and surfaces a friendly fallback instead of the opaque Next.js
 * 500 page.
 */
export default function GettingStartedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[getting-started] render error", {
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
          Couldn&apos;t load Getting Started
        </h1>
        <p className="text-sm text-muted-foreground">
          The onboarding checklist ran into an error. The team has
          been notified. In the meantime, you can head straight to
          the Dashboard or Reports Center.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            ref: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/">Dashboard</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/reports">Reports Center</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
