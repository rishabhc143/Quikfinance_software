import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalesImportWizard } from "@/components/shared/sales-import-wizard";
import { importTimesheetAction } from "./actions";
import { SAMPLE_TIMESHEET_CSV } from "./sample";

export const metadata = { title: "Import Timesheets" };

/**
 * Timesheet CSV import. Reuses the shared SalesImportWizard for the
 * 3-step Configure → Preview → Done flow (same UX as Sales imports).
 *
 * For the full Zoho-style 3-step wizard with explicit Map Fields, see
 * the Projects equivalent at /time/projects/import. This module uses
 * the simpler 2-step path because the column names are well-defined
 * and most users can prep the CSV upfront.
 */
export default function ImportTimesheetPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/time/entries">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import Timesheets</h1>
      </div>

      <SalesImportWizard
        entityLabel="Timesheets"
        sampleCsv={SAMPLE_TIMESHEET_CSV}
        sampleFilename="quikfinance-timesheet-sample.csv"
        redirectAfter="/time/entries"
        action={async ({ csvText, dupHandling }) => {
          "use server";
          return await importTimesheetAction({ csvText, dupHandling });
        }}
        pageTips={[
          "Date must be in yyyy-MM-dd format (e.g. 2026-05-20).",
          "Project Name must match an existing project; Task Name must match a task within it.",
          "User Email must match an existing org member.",
          "Hours is decimal (e.g. 1.5 for 1h 30m). Billable defaults to true; pass 'false' to mark non-billable.",
          "Skip Duplicates keeps existing entries; Overwrite updates the notes/billable flag on matching (user/date/project/task/hours) tuples.",
        ]}
      />
    </div>
  );
}
