import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Module Settings — Expenses" };

export default function Page() {
  return (
    <SettingsShell title="Module Settings — Expenses" description="Receipt-required threshold, default category.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module preferences are saved on the OrganizationPreference row. The defaults below apply to all new expenses records.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Defaults for expenses</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Granular per-field defaults for this module ship with a future release. Globally applicable settings live on /settings/general and /settings/email-notifications.</p>
          <Button asChild variant="outline" size="sm"><Link href="/purchases/expenses">Open Expenses</Link></Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
