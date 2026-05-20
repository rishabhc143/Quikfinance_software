import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Import Projects" };

/**
 * Stub page for "Import Projects / Tasks" reachable from the 3-dot menu
 * on /time/projects. The actual CSV upload pipeline ships in a future
 * PR; for now we surface the expected format + a sample CSV so users
 * can prep their data while we build it.
 */
export default function ImportProjectsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const type = searchParams.type === "tasks" ? "tasks" : "projects";
  const isTasks = type === "tasks";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/time/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">
          Import {isTasks ? "Tasks" : "Projects"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            CSV upload is coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            We&rsquo;re building the {isTasks ? "task" : "project"} CSV
            importer in a follow-up release. In the meantime, here&rsquo;s
            the expected column shape so you can prep your data now and
            upload it in one shot when the importer lands.
          </p>

          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Expected columns
            </div>
            {isTasks ? (
              <ul className="space-y-1.5 text-xs font-mono">
                <li>Project Name (must match an existing project)</li>
                <li>Task Name</li>
                <li>Description (optional)</li>
                <li>Billable (true / false)</li>
              </ul>
            ) : (
              <ul className="space-y-1.5 text-xs font-mono">
                <li>Project Name</li>
                <li>Project Code (optional)</li>
                <li>Customer Name (must match an existing customer)</li>
                <li>Billing Method (fixed_cost / project_hours / task_hours / staff_hours)</li>
                <li>Description (optional)</li>
                <li>Cost Budget (optional, numeric)</li>
                <li>Revenue Budget (optional, numeric)</li>
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href="/time/projects/export" download>
                <Download className="h-3.5 w-3.5" />
                Download current as CSV (sample shape)
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/time/projects/new">Create one manually</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-2 border-t">
            Want a preview slot when this ships? Ping{" "}
            <a
              href="mailto:support@quikfinance.app"
              className="text-blue-600 hover:text-blue-700"
            >
              support@quikfinance.app
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
