import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { AiPreferencesForm } from "./form";

export const metadata = { title: "AI Preferences" };

export default async function AiPreferencesPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="AI Preferences" description="Customize how the Quikfinance AI Assistant behaves for your organization.">
      <Card>
        <CardContent className="pt-6">
          <AiPreferencesForm initial={{ systemPromptOverride: prefs.aiSystemPromptOverride ?? "", rateLimitPerDay: prefs.aiRateLimitPerDay }} />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
