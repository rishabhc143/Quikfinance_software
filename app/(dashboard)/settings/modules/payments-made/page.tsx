import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Module Settings — Payments Made" };

export default function Page() {
  return (
    <SettingsShell title="Module Settings — Payments Made" description="Auto-allocate-oldest-first, default debit account.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module preferences are saved on the OrganizationPreference row. The defaults below apply to all new payments mades records.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Defaults for payments mades</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Granular per-field defaults for this module ship with a future release. Globally applicable settings live on /settings/general and /settings/email-notifications.</p>
          <Button asChild variant="outline" size="sm"><Link href="/purchases/payments-made">Open Payments Made</Link></Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
