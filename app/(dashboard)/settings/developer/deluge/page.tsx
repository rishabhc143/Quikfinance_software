import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export const metadata = { title: "Deluge Components Usage" };

export default function DelugePage() {
  return (
    <SettingsShell title="Deluge Components Usage" description="Zoho-style scripted automation usage tracking.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Quikfinance uses Workflow Rules + Workflow Actions + JavaScript-based custom code (planned). Deluge-specific tracking is a vestigial label from the migration template; this page mirrors the structure for compatibility but reports no usage.</AlertDescription></Alert>
      <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">0 components, 0 invocations.</CardContent></Card>
    </SettingsShell>
  );
}
