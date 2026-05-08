import * as React from "react";
import { SalesDebugError } from "@/components/shared/sales-debug-error";

/**
 * Diagnostic wrapper for Sales list page server components.
 *
 * v2: ALWAYS renders the debug card on caught errors. The previous
 * `?debug=1` gate was too strict — the sidebar Link strips query
 * params on navigation, so the user could never reach the gate by
 * clicking. We're in a temporary diagnostic mode anyway, so always
 * surfacing the real error is the right call.
 *
 * Wrap a page's default export with this. On error:
 *   - Logs the full message + stack to console.error so Vercel runtime
 *     logs also capture it (belt-and-suspenders).
 *   - Returns an inline `<SalesDebugError>` rendering the actual
 *     error name, message, stack, and Prisma `code`/`meta` if present.
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
      // Always render the debug card; this is a temporary build.
      return (
        <SalesDebugError
          route={route}
          searchParams={props.searchParams ?? {}}
          error={err}
        />
      );
    }
  };
}
