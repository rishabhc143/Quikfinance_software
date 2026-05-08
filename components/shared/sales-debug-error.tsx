/**
 * Diagnostic component rendered ONLY when a Sales list page throws AND
 * the URL contains `?debug=1`. Surfaces the full error message + stack
 * so we can diagnose data-dependent production errors without needing
 * Vercel runtime log access.
 *
 * This is a server component intentionally — we want to render the
 * server-side error directly into HTML.
 */
export function SalesDebugError({
  route,
  searchParams,
  error,
}: {
  route: string;
  searchParams: Record<string, string | string[] | undefined>;
  error: unknown;
}) {
  const message =
    error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error && typeof error.stack === "string"
      ? error.stack
      : "";
  const name = error instanceof Error ? error.name : "UnknownError";
  // Some Prisma errors carry .code and .meta — surface those if present.
  const extra: Record<string, unknown> = {};
  if (error && typeof error === "object") {
    for (const key of ["code", "clientVersion", "meta"]) {
      if (key in (error as Record<string, unknown>)) {
        extra[key] = (error as Record<string, unknown>)[key];
      }
    }
  }
  return (
    <div className="p-6">
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 max-w-4xl mx-auto">
        <div className="font-mono text-xs uppercase tracking-wider text-destructive mb-2">
          DEBUG — server component threw
        </div>
        <h1 className="text-xl font-semibold mb-1">{name}</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Route: <code>{route}</code>
        </p>
        <div className="rounded bg-background border p-3 mb-4">
          <div className="text-xs font-mono uppercase text-muted-foreground mb-1">
            message
          </div>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono">
            {message || "(empty)"}
          </pre>
        </div>
        {Object.keys(extra).length > 0 ? (
          <div className="rounded bg-background border p-3 mb-4">
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">
              extra
            </div>
            <pre className="text-xs whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(extra, null, 2)}
            </pre>
          </div>
        ) : null}
        {stack ? (
          <details className="rounded bg-background border p-3 mb-4">
            <summary className="text-xs font-mono uppercase text-muted-foreground cursor-pointer">
              stack trace
            </summary>
            <pre className="text-xs whitespace-pre-wrap break-words font-mono mt-2">
              {stack}
            </pre>
          </details>
        ) : null}
        <details className="rounded bg-background border p-3">
          <summary className="text-xs font-mono uppercase text-muted-foreground cursor-pointer">
            search params
          </summary>
          <pre className="text-xs whitespace-pre-wrap break-words font-mono mt-2">
            {JSON.stringify(searchParams, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
