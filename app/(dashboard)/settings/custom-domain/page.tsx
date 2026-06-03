import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Info } from "lucide-react";
import { CustomDomainForm } from "./form";

export const metadata = { title: "Custom Domain" };

export default async function CustomDomainPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: {}, create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="Custom Domain" description="Use your own domain for invoices and customer-facing pages.">
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Saving a custom domain stores it in Quikfinance preferences. DNS verification + SSL provisioning is handled by your hosting provider (Vercel handles it automatically).
          Production deployments should also configure the matching record in Vercel&apos;s domain settings.
        </AlertDescription>
      </Alert>
      <Card>
        <CardContent className="pt-6">
          <CustomDomainForm initial={prefs.customDomain ?? ""} />
        </CardContent>
      </Card>
    </SettingsShell></DirtyFormProvider>
  );
}
