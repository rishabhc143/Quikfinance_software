"""Write all remaining settings sub-page implementations in one shot."""
from pathlib import Path

ROOT = Path(r"C:\Users\user\Quikfinance\app\(dashboard)\settings")

FILES: dict[str, str] = {}

# ───────── SMS Notifications ─────────
FILES["sms-notifications/page.tsx"] = '''import { db } from "@/lib/db";
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
'''
FILES["sms-notifications/form.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function SmsForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function toggle(v: boolean) {
    setEnabled(v); setBusy(true);
    try { await updatePreferenceAction({ key: "smsEnabled", value: v }); toast.success("Saved"); router.refresh(); }
    catch { setEnabled(!v); toast.error("Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label>Enable SMS notifications</Label>
        <p className="text-xs text-muted-foreground">Customers receive SMS for invoices and receipts.</p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
    </div>
  );
}
'''

# ───────── Digital Signature ─────────
FILES["digital-signature/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { DigitalSignatureForm } from "./form";

export const metadata = { title: "Digital Signature" };

export default async function DigitalSignaturePage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="Digital Signature" description="Cryptographically sign invoices, quotes, and PDFs. Required in some jurisdictions.">
      <Card><CardContent className="pt-6"><DigitalSignatureForm initial={prefs.digitalSignatureEnabled} /></CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["digital-signature/form.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function DigitalSignatureForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function toggle(v: boolean) {
    setEnabled(v); setBusy(true);
    try { await updatePreferenceAction({ key: "digitalSignatureEnabled", value: v }); toast.success("Saved"); router.refresh(); }
    catch { setEnabled(!v); toast.error("Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Sign documents</Label>
          <p className="text-xs text-muted-foreground">Append a digital signature block to outgoing PDFs.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
      </div>
      <p className="text-xs text-muted-foreground">Signing certificates upload via the Integrations workflow (planned). The toggle gates the feature.</p>
    </div>
  );
}
'''

# ───────── Opening Balances (link to bank accounts) ─────────
FILES["opening-balances/page.tsx"] = '''import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { SettingsShell } from "@/components/shared/settings-shell";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Opening Balances" };

export default async function OpeningBalancesPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true, openingBalance: true, currency: true },
    orderBy: { name: "asc" },
  });
  return (
    <SettingsShell title="Opening Balances" description="Bring forward balances from your previous accounting system.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Opening balances live on each bank account. Edit them by opening the account from /banking.</AlertDescription></Alert>
      <Card>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No bank accounts yet. <Link href="/banking/accounts/new" className="underline">Create one</Link>.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Account</th><th className="text-right p-3">Opening balance</th></tr></thead>
              <tbody className="divide-y">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(Number(a.openingBalance), a.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Button asChild variant="outline"><Link href="/banking">Manage bank accounts</Link></Button>
    </SettingsShell>
  );
}
'''

# ───────── Accessibility ─────────
FILES["accessibility/page.tsx"] = '''import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
'''

for rel, content in FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"wrote {rel}")
print(f"\nTotal: {len(FILES)} files")
