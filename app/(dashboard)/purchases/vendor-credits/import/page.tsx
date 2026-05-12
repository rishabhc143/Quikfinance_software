import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { ImportVendorCreditsWizard } from "./wizard";

export const metadata = { title: "Import Vendor Credits" };

/**
 * Server wrapper for the Vendor Credits CSV import wizard.
 *
 * Credit Note numbers are AUTO-generated via getNextDocumentNumber
 * (prefix CN- per spec), so the CSV column is optional. Dedup is by
 * `(orgId, contactId, referenceNumber)` because that's the only
 * stable user-supplied identifier on a Vendor Credit row.
 */
export default async function ImportVendorCreditsPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/vendor-credits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import vendor credits</h1>
      </div>
      <ImportVendorCreditsWizard />
    </div>
  );
}
