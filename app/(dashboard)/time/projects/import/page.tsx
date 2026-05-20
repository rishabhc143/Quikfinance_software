import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importProjectsAction } from "./actions";
import { SAMPLE_PROJECTS_CSV } from "./sample";

export const metadata = { title: "Import Projects" };

/**
 * Projects CSV import wizard. Reuses the shared SalesImportWizard
 * for the 3-step flow (Configure → Preview → Done) — same UX as
 * Sales import.
 *
 * `?type=tasks` still routes here for now but shows a coming-soon
 * note; the Task import lands in a follow-up PR.
 */
export default function ImportProjectsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const isTasks = searchParams.type === "tasks";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/time/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">
          {isTasks ? "Import Tasks" : "Import Projects"}
        </h1>
      </div>

      {isTasks ? (
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
      ) : (
        <SalesImportWizard
          entityLabel="Projects"
          sampleCsv={SAMPLE_PROJECTS_CSV}
          sampleFilename="quikfinance-projects-sample.csv"
          redirectAfter="/time/projects"
          action={importProjectsAction}
          pageTips={[
            "Customer Name must exactly match an existing customer's display name (case-insensitive). Create the customer first if it doesn't exist.",
            "Billing Method accepts either the value (fixed_cost / project_hours / task_hours / staff_hours) or the friendly label (e.g. 'Based on Project Hours').",
            "Cost Budget and Revenue Budget are optional numeric columns. Commas are stripped before parsing.",
            "Skip Duplicates keeps existing projects untouched; Overwrite updates them in place by Project Name.",
          ]}
        />
      )}
    </div>
  );
}
