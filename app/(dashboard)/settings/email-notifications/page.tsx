import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { EmailNotificationsForm } from "./form";

export const metadata = { title: "Email Notifications" };

export default async function EmailNotificationsPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="Email Notifications" description="Choose which events trigger emails for your team and customers.">
      <Card>
        <CardContent className="pt-6">
          <EmailNotificationsForm
            initial={{
              emailOnInvoiceSent: prefs.emailOnInvoiceSent,
              emailOnInvoicePaid: prefs.emailOnInvoicePaid,
              emailOnBillDue: prefs.emailOnBillDue,
              emailOnPaymentReceived: prefs.emailOnPaymentReceived,
              emailOnEstimateAccepted: prefs.emailOnEstimateAccepted,
              emailDigestWeekly: prefs.emailDigestWeekly,
            }}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
