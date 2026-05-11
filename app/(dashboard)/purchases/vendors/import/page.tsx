import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireOrganization } from "@/lib/auth-helpers";

export const metadata = { title: "Import Vendors" };

/**
 * P2-A placeholder for the Vendor Import wizard.
 *
 * Full implementation lands in P2-C: 4-step wizard (upload →
 * column-map → preview → commit), CSV/XLS support, IFSC validation
 * in bulk, dup-displayName detection. For now we render a clean
 * "coming soon" surface so the list page's Import button doesn't
 * 404 and so users see what's planned.
 */
export default async function ImportVendorsPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/purchases/vendors" className="hover:underline">
          Vendors
        </Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Import</span>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link href="/purchases/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import vendors
        </h1>
      </div>

      <Card>
        <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center text-center gap-3">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">Bulk vendor import is on the way</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We&apos;re building a four-step wizard — upload your CSV/XLSX,
            map columns, preview, and commit. For now you can add vendors
            individually.
          </p>
          <div className="flex gap-2 pt-2">
            <Button asChild className="gap-1">
              <Link href="/purchases/vendors/new">
                <Plus className="h-4 w-4" /> Create new vendor
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/purchases/vendors">Back to vendors</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
