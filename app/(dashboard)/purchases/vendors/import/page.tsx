import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { ImportVendorsWizard } from "./wizard";

export const metadata = { title: "Import Vendors" };

export default async function ImportVendorsPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Import vendors</h1>
      </div>
      <ImportVendorsWizard />
    </div>
  );
}
