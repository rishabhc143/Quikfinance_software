import * as React from "react";
import { SalesDebugError } from "@/components/shared/sales-debug-error";

/**
 * Diagnostic wrapper for Sales list page server components.
 *
 * Wrap a page's default export with this. On error:
 *   - Logs the full message + stack to console.error so Vercel runtime
 *     logs capture it (server-side log, distinct from the client-side
 *     console.error in app/(dashboard)/error.tsx).
 *   - If `searchParams.debug === "1"`, returns an inline debug
 *     component rendering the actual error so we can read it without
 *     log access.
 *   - Otherwise re-throws so the existing error boundary triggers
 *     normally.
 *
 * Ship this in a temporary diagnostic PR. Once we identify the root
 * cause, the wrapper is removed and pages return to bare implementations.
 */
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: SearchParams };
type PageFn<P extends PageProps> = (props: P) => Promise<React.ReactElement>;

export function withDiagnostic<P extends PageProps>(
  route: string,
  page: PageFn<P>
): PageFn<P> {
  return async function DiagnosticWrappedPage(props: P) {
    try {
      return await page(props);
    } catch (err) {
      // Server-side log — Vercel captures stderr to runtime logs.
      const stack =
        err instanceof Error && typeof err.stack === "string"
          ? err.stack
          : "(no stack)";
      // eslint-disable-next-line no-console
      console.error(
        `[sales-diagnostic] ${route} threw:`,
        err instanceof Error ? err.message : String(err),
        "\nsearchParams:",
        JSON.stringify(props.searchParams ?? {}),
        "\nstack:",
        stack
      );
      const debugFlag = props.searchParams?.debug;
      const debugOn = debugFlag === "1" || debugFlag === "true";
      if (debugOn) {
        return (
          <SalesDebugError
            route={route}
            searchParams={props.searchParams ?? {}}
            error={err}
          />
        );
      }
      throw err;
    }
  };
}
