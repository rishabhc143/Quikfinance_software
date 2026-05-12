import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { ImportBillsWizard } from "./wizard";

export const metadata = { title: "Import Bills" };

/**
 * Server wrapper for the Bills CSV import wizard.
 *
 * Mirrors `app/(dashboard)/purchases/vendors/import/page.tsx`. The
 * wizard is purely client-side until the user hits Import — at which
 * point `importBillsAction` is invoked. Created bills land as DRAFT
 * so the user can review before marking Open.
 */
export default async function ImportBillsPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/bills">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import bills</h1>
      </div>
      <ImportBillsWizard />
    </div>
  );
}
