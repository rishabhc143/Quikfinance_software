import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Upload } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import Manual Journals" };

/**
 * ACCT-A.4.b — Server wrapper for the Bulk Import wizard. All
 * heavy lifting (CSV parse, org lookups, transactional inserts)
 * happens inside the wizard's server actions. This page only
 * ensures the user has an active org context.
 */
export default async function ImportManualJournalsPage() {
  await requireOrganization();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <BackLink href="/accountant/manual-journals"><ArrowLeft className="h-4 w-4" /></BackLink>
        </Button>
        <Upload className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Import Manual Journals</h1>
      </div>
      <ImportWizard />
    </div>
  );
}
