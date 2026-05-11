import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { requireOrganization } from "@/lib/auth-helpers";
import { ProfileForm } from "./form";

export const metadata = { title: "Organization Profile" };

export default async function ProfilePage() {
  const { organization } = await requireOrganization();
  return (
    <SettingsShell title="Organization Profile" description="Name, country, currency, fiscal year, and contact details.">
      <Card>
        <CardContent className="pt-6">
          <ProfileForm
            initial={{
              name: organization.name,
              slug: organization.slug,
              country: organization.country,
              currency: organization.currency,
              fiscalYearStart: organization.fiscalYearStart,
              gstin: organization.gstin ?? "",
              logoUrl: organization.logoUrl,
            }}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
