"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-lg border bg-background p-12 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 mx-auto text-destructive opacity-60" />
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
        {error.digest && <p className="text-xs text-muted-foreground">ref: {error.digest}</p>}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
