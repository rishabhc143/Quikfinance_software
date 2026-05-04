import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItemsPreferencesForm } from "./form";

export const metadata = { title: "Items Preferences" };

export default async function ItemsPreferencesPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/settings"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Items Preferences</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
            Enable inventory tracking to record stock levels for goods, set reorder points, and track opening balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemsPreferencesForm initialEnabled={prefs.inventoryEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
