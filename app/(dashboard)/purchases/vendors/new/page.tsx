import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrganization } from "@/lib/auth-helpers";
import { VendorForm } from "../vendor-form";
import { createVendorAction } from "../actions";

export const metadata = { title: "New Vendor" };

export default async function NewVendorPage() {
  await requireOrganization();
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/purchases/vendors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New Vendor</h1>
      </div>
      <VendorForm action={createVendorAction} submitLabel="Save vendor" />
    </div>
  );
}
