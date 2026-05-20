import Link from "next/link";
import { ImportProjectsWizard } from "./wizard";

export const metadata = { title: "Projects - Select File" };

/**
 * Projects CSV import. Renders the 3-step wizard matching the
 * reference layout (Configure → Map Fields → Preview).
 *
 * The `?type=tasks` legacy route still resolves and shows a
 * "Coming soon" notice — Task import lands in a follow-up PR.
 */
export default function ImportProjectsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  if (searchParams.type === "tasks") {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Import Tasks</h1>
            <Link
              href="/time/projects"
              aria-label="Close"
              className="rounded-md p-1.5 hover:bg-muted text-destructive"
            >
              ✕
            </Link>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-5 text-sm space-y-2">
            <p className="font-medium">Task import is coming soon.</p>
            <p className="text-muted-foreground">
              For now, add tasks one at a time from the project detail page, or
              include tasks inline when creating projects from the{" "}
              <Link
                href="/time/projects/new"
                className="text-blue-600 hover:text-blue-700"
              >
                New Project form
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <ImportProjectsWizard />;
}
