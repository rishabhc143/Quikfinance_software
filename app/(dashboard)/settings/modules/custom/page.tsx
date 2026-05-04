import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Module Settings — Custom Modules" };

export default function Page() {
  return (
    <SettingsShell title="Module Settings — Custom Modules" description="Define new modules with custom fields and views.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module preferences are saved on the OrganizationPreference row. The defaults below apply to all new custom modules records.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Defaults for custom modules</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Granular per-field defaults for this module ship with a future release. Globally applicable settings live on /settings/general and /settings/email-notifications.</p>
          <p className="text-xs text-muted-foreground">Custom modules support is queued — schema for `WebForm`, `WorkflowAction`, and `Integration` lays the groundwork.</p>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
