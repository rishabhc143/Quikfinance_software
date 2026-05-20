import { ImportTimesheetWizard } from "./wizard";

export const metadata = { title: "Timesheets - Select File" };

/**
 * Timesheet CSV import — 3-step wizard (Configure → Map Fields → Preview)
 * matching the Projects import look 1:1.
 */
export default function ImportTimesheetPage() {
  return <ImportTimesheetWizard />;
}
