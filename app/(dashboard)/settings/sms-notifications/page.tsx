import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";
import { SmsForm } from "./form";

export const metadata = { title: "SMS Notifications" };

export default async function SmsPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="SMS Notifications" description="Send SMS alerts for new invoices, payment receipts, and overdue reminders.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>SMS provider keys (Twilio / MSG91) live on the Integrations &rarr; SMS page. The toggle here gates whether the provider is invoked.</AlertDescription></Alert>
      <Card><CardContent className="pt-6"><SmsForm initial={prefs.smsEnabled} /></CardContent></Card>
    </SettingsShell>
  );
}
