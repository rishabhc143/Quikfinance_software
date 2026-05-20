"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment-level error boundary for /time/projects/new.
 *
 * If the page errors during render (server or client), this surfaces
 * a useful fallback with the digest reference, rather than the opaque
 * top-level error.tsx. Also wires up a "Try again" button + a path
 * back to the project list.
 *
 * The `digest` property is the Next.js production error hash — we
 * surface it so we can correlate with server logs.
 */
export default function NewProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Client-side console capture — appears in browser DevTools.
    console.error("[time/projects/new] render failed:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">New Project</h1>
          <Link
            href="/time/projects"
            aria-label="Close"
            className="rounded-md p-1.5 hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-amber-900 dark:text-amber-100">
                Couldn&apos;t load the New Project form
              </h2>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                Something went wrong while preparing the form. The team has
                been notified; please try again in a moment.
              </p>
              {error.digest && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 font-mono">
                  ref: {error.digest}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={reset}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
              >
                Try again
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/time/projects">Back to Projects</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
