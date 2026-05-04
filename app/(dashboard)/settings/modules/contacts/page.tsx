import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Module Settings — Customers and Vendors" };

export default function Page() {
  return (
    <SettingsShell title="Module Settings — Customers and Vendors" description="Defaults for new contacts: payment terms, currency, tags.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module preferences are saved on the OrganizationPreference row. The defaults below apply to all new customers and vendors records.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Defaults for customers and vendors</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Granular per-field defaults for this module ship with a future release. Globally applicable settings live on /settings/general and /settings/email-notifications.</p>
          <Button asChild variant="outline" size="sm"><Link href="/contacts">Open Customers and Vendors</Link></Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
