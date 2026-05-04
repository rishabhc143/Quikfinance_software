import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Accessibility Preferences" };

export default function AccessibilityPage() {
  return (
    <SettingsShell title="Accessibility Preferences" description="Configure reduced motion, contrast, and screen-reader optimizations.">
      <Card>
        <CardHeader><CardTitle className="text-base">Built-in conformance</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>All interactive elements are keyboard-reachable with visible focus rings.</li>
            <li>Form inputs are associated with labels.</li>
            <li>Color contrast targets WCAG AA (4.5:1) for body text.</li>
            <li>Toast notifications use Sonner with ARIA live regions.</li>
            <li>Theme can be switched between Light, Dark, and System.</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">Per-user override controls (font scaling, motion reduction, high contrast) ship with a future release; the OS-level reduce-motion preference is already honored.</p>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
