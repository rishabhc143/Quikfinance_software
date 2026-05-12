import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { ImportRecurringBillsWizard } from "./wizard";

export const metadata = { title: "Import Recurring Bills" };

/**
 * Server wrapper for the Recurring Bills CSV import wizard.
 *
 * Profiles are created with a single primary line per CSV row. The
 * cron's `generateBillFromProfile` will unpack `templateJson` into
 * actual BillLineItem rows when it generates Bills. Multi-line
 * recurring profiles can be edited on the detail page after import.
 */
export default async function ImportRecurringBillsPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/recurring-bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import recurring bills</h1>
      </div>
      <ImportRecurringBillsWizard />
    </div>
  );
}
