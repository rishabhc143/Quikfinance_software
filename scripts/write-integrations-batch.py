"""Batch-write Integrations and Developer settings pages."""
from pathlib import Path

ROOT = Path(r"C:\Users\user\Quikfinance\app\(dashboard)\settings")
FILES: dict[str, str] = {}

# ───────── Integration shared action ─────────
FILES["integrations/_action.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function setIntegrationConnectedAction(kind: string, isConnected: boolean) {
  const { user, organization } = await requireOrganization();
  await db.integration.upsert({
    where: { organizationId_kind: { organizationId: organization.id, kind } },
    update: { isConnected, connectedAt: isConnected ? new Date() : null },
    create: { organizationId: organization.id, kind, isConnected, connectedAt: isConnected ? new Date() : null },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Integration", entityId: kind, after: { kind, isConnected } });
  revalidatePath("/settings/integrations/" + kind.replace("_", "-"));
}
'''

INTEGRATIONS = [
  ("apps", "Quikfinance Apps", "First-party apps, mobile clients, and add-ons published by Quikfinance.", "quikfinance-apps"),
  ("whatsapp", "WhatsApp", "Send invoices, payment reminders, and receipts via WhatsApp Business.", "whatsapp"),
  ("sms", "SMS Integrations", "Connect Twilio, MSG91, or another SMS gateway for outgoing alerts.", "sms"),
  ("bharat-connect", "Bharat Connect", "Government e-invoice / e-way-bill integration for Indian businesses.", "bharat-connect"),
  ("uber", "Uber for Business", "Pull Uber for Business expenses directly into Quikfinance.", "uber"),
  ("other", "Other Apps", "Zapier, Make, IFTTT — connect Quikfinance to thousands of apps.", "other"),
  ("marketplace", "Marketplace", "Browse community-built integrations, themes, and templates.", "marketplace"),
]

INTEGRATION_PAGE = '''import {{ db }} from "@/lib/db";
import {{ requireOrganization }} from "@/lib/auth-helpers";
import {{ Card, CardContent }} from "@/components/ui/card";
import {{ SettingsShell }} from "@/components/shared/settings-shell";
import {{ IntegrationCard }} from "../_card";

export const metadata = {{ title: "{label}" }};

export default async function Page() {{
  const {{ organization }} = await requireOrganization();
  const integration = await db.integration.findUnique({{
    where: {{ organizationId_kind: {{ organizationId: organization.id, kind: "{kind}" }} }},
  }});
  return (
    <SettingsShell title="{label}" description="{description}">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="{kind}" label="{label}" connected={{integration?.isConnected ?? false}} />
      </CardContent></Card>
    </SettingsShell>
  );
}}
'''

FILES["integrations/_card.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setIntegrationConnectedAction } from "./_action";
import { toast } from "sonner";

export function IntegrationCard({ kind, label, connected }: { kind: string; label: string; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function flip() {
    setBusy(true);
    try {
      await setIntegrationConnectedAction(kind, !connected);
      toast.success(!connected ? "Connected" : "Disconnected");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium flex items-center gap-2">
          {label}
          {connected && <Badge variant="success" className="text-xs"><Check className="h-3 w-3 mr-0.5" />Connected</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Provider keys are configured in your environment. Toggling connection here flips the gate; the actual API call uses keys you set in your hosting provider.
        </p>
      </div>
      <Button onClick={flip} disabled={busy} variant={connected ? "outline" : "default"}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}
'''

for kind, label, desc, slug in INTEGRATIONS:
    rel = f"integrations/{slug}/page.tsx"
    FILES[rel] = INTEGRATION_PAGE.format(kind=kind, label=label, description=desc)

# ───────── Developer pages ─────────

# Webhooks
FILES["developer/webhooks/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebhooksManager } from "./manager";

export const metadata = { title: "Incoming Webhooks" };

export default async function WebhooksPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webhook.findMany({ where: { organizationId: organization.id }, orderBy: { event: "asc" } });
  return (
    <SettingsShell title="Incoming Webhooks" description="Subscribe to Quikfinance events with HTTP callbacks.">
      <Card><CardContent className="pt-6">
        <WebhooksManager initial={rows.map((w) => ({ id: w.id, url: w.url, event: w.event, isActive: w.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["developer/webhooks/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  url: z.string().url(),
  event: z.string().min(1).max(40),
});

export async function createWebhookAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ url: formData.get("url"), event: formData.get("event") });
  const created = await db.webhook.create({
    data: { organizationId: organization.id, ...data, secret: crypto.randomBytes(24).toString("hex") },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Webhook", entityId: created.id, after: data });
  revalidatePath("/settings/developer/webhooks");
}

export async function deleteWebhookAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webhook.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Webhook", entityId: id });
  revalidatePath("/settings/developer/webhooks");
}
'''
FILES["developer/webhooks/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWebhookAction, deleteWebhookAction } from "./actions";
import { toast } from "sonner";

type Hook = { id: string; url: string; event: string; isActive: boolean };

export function WebhooksManager({ initial }: { initial: Hook[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWebhookAction(new FormData(e.currentTarget)); toast.success("Webhook subscribed"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Webhook URL</Label><Input name="url" type="url" required placeholder="https://api.you.com/webhook" /></div>
        <div>
          <Label>Event</Label>
          <select name="event" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option>invoice.created</option><option>invoice.paid</option><option>bill.created</option><option>bill.paid</option><option>payment.received</option><option>payment.made</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Subscribe</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No webhooks subscribed yet.</div>
        ) : initial.map((h) => (
          <div key={h.id} className="p-3 flex items-center gap-3 text-sm">
            <Badge variant="outline">{h.event}</Badge>
            <code className="flex-1 truncate text-xs">{h.url}</code>
            {h.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWebhookAction(h.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
'''

# Connections (read-only display of integrations + their configs)
FILES["developer/connections/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const { organization } = await requireOrganization();
  const integrations = await db.integration.findMany({ where: { organizationId: organization.id }, orderBy: { kind: "asc" } });
  return (
    <SettingsShell title="Connections" description="External providers connected to this organization.">
      <Card>
        <CardContent className="p-0">
          {integrations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No connections yet. Connect providers from /settings/integrations.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Provider</th><th className="text-left p-3">Status</th><th className="text-left p-3">Connected</th></tr></thead>
              <tbody className="divide-y">
                {integrations.map((i) => (
                  <tr key={i.id}>
                    <td className="p-3 font-medium capitalize">{i.kind.replace("-", " ")}</td>
                    <td className="p-3"><Badge variant={i.isConnected ? "success" : "secondary"}>{i.isConnected ? "Connected" : "Not connected"}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{i.connectedAt ? format(i.connectedAt, "dd MMM yyyy HH:mm") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
'''

# API Usage
FILES["developer/api-usage/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { format, subDays } from "date-fns";

export const metadata = { title: "API Usage" };

export default async function ApiUsagePage() {
  const { organization } = await requireOrganization();
  const since = subDays(new Date(), 7);
  const [count, recent] = await Promise.all([
    db.apiUsageLog.count({ where: { organizationId: organization.id, createdAt: { gte: since } } }),
    db.apiUsageLog.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <SettingsShell title="API Usage" description="Requests made via your API keys in the last 7 days.">
      <Card><CardContent className="pt-6"><div className="text-3xl font-semibold tabular-nums">{count.toLocaleString()}</div><div className="text-xs text-muted-foreground mt-1">requests last 7 days</div></CardContent></Card>
      <Card>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No API requests logged yet. Logs populate once API keys are issued and used.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Method</th><th className="text-left p-3">Endpoint</th><th className="text-right p-3">Status</th><th className="text-right p-3">Duration</th></tr></thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(r.createdAt, "dd MMM HH:mm:ss")}</td>
                    <td className="p-3 font-mono text-xs">{r.method}</td>
                    <td className="p-3 font-mono text-xs truncate max-w-[300px]">{r.endpoint}</td>
                    <td className="p-3 text-right tabular-nums">{r.statusCode}</td>
                    <td className="p-3 text-right tabular-nums">{r.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
'''

# Signals (read-only: surfaces unusual activity from audit log)
FILES["developer/signals/page.tsx"] = '''import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Signals" };

export default async function SignalsPage() {
  const { organization } = await requireOrganization();
  // Recent destructive operations as "signals"
  const signals = await db.auditLog.findMany({
    where: { organizationId: organization.id, action: { in: ["DELETE", "UPDATE"] } },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  return (
    <SettingsShell title="Signals" description="Recent significant changes across this organization. Useful for catching unintended mutations.">
      <Card>
        <CardContent className="p-0">
          {signals.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No significant activity yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Action</th><th className="text-left p-3">Entity</th><th className="text-left p-3">ID</th></tr></thead>
              <tbody className="divide-y">
                {signals.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(s.createdAt, "dd MMM HH:mm")}</td>
                    <td className="p-3"><Badge variant={s.action === "DELETE" ? "destructive" : "outline"}>{s.action}</Badge></td>
                    <td className="p-3">{s.entityType}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.entityId.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
'''

# Data Management
FILES["developer/data/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import Link from "next/link";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Data Management" };

export default async function DataPage() {
  const { organization } = await requireOrganization();
  const orgId = organization.id;
  const [items, contacts, invoices, bills, payments, expenses] = await Promise.all([
    db.item.count({ where: { organizationId: orgId } }),
    db.contact.count({ where: { organizationId: orgId } }),
    db.invoice.count({ where: { organizationId: orgId } }),
    db.bill.count({ where: { organizationId: orgId } }),
    db.paymentReceived.count({ where: { organizationId: orgId } }),
    db.expense.count({ where: { organizationId: orgId } }),
  ]);
  return (
    <SettingsShell title="Data Management" description="Bulk export, import, and storage usage for this organization.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module export already lives on each list page (Items has CSV/XLSX). Org-wide JSON dump and time-bounded archive shipping with a future release.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Record counts</CardTitle></CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 md:grid-cols-3 text-sm">
          <Stat label="Items" n={items} /><Stat label="Contacts" n={contacts} /><Stat label="Invoices" n={invoices} /><Stat label="Bills" n={bills} /><Stat label="Payments received" n={payments} /><Stat label="Expenses" n={expenses} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Quick exports</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/api/items/export?scope=all">Items CSV</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/api/items/export?scope=all&format=xlsx">Items XLSX</Link></Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums">{n.toLocaleString()}</div></div>;
}
'''

# Deluge — Zoho-specific, mark as not applicable to Quikfinance
FILES["developer/deluge/page.tsx"] = '''import { Card, CardContent } from "@/components/ui/card";
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
'''

# Web Forms
FILES["developer/web-forms/page.tsx"] = '''import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebFormsManager } from "./manager";

export const metadata = { title: "Web Forms" };

export default async function WebFormsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webForm.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Web Forms" description="Embed lead-capture and contact-creation forms on your website.">
      <Card><CardContent className="pt-6">
        <WebFormsManager initial={rows.map((w) => ({ id: w.id, name: w.name, slug: w.slug, isActive: w.isActive, submissionsCount: w.submissionsCount }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
'''
FILES["developer/web-forms/actions.ts"] = '''"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/).max(120) });

export async function createWebFormAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({ name: formData.get("name"), slug: formData.get("slug") });
  const exists = await db.webForm.findUnique({ where: { slug: data.slug } });
  if (exists) throw new Error("That slug is taken.");
  const created = await db.webForm.create({ data: { organizationId: organization.id, ...data, formConfig: { fields: [{ name: "email", type: "email", required: true }] } } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "WebForm", entityId: created.id, after: data });
  revalidatePath("/settings/developer/web-forms");
}

export async function deleteWebFormAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.webForm.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "WebForm", entityId: id });
  revalidatePath("/settings/developer/web-forms");
}
'''
FILES["developer/web-forms/manager.tsx"] = '''"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWebFormAction, deleteWebFormAction } from "./actions";
import { toast } from "sonner";

type Form = { id: string; name: string; slug: string; isActive: boolean; submissionsCount: number };

export function WebFormsManager({ initial }: { initial: Form[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWebFormAction(new FormData(e.currentTarget)); toast.success("Form created"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
        <div><Label>URL slug</Label><Input name="slug" required pattern="[a-z0-9-]+" maxLength={120} placeholder="contact-us" /></div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create form</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No web forms yet.</div>
        ) : initial.map((f) => {
          const url = typeof window === "undefined" ? "" : `${window.location.origin}/forms/${f.slug}`;
          return (
            <div key={f.id} className="p-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{f.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <code>{url}</code>
                  <Badge variant="outline">{f.submissionsCount} submissions</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }} aria-label="Copy URL"><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWebFormAction(f.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Public form rendering at /forms/[slug] ships with a future release. Submissions endpoint is queued.</p>
    </div>
  );
}
'''

for rel, content in FILES.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"wrote {rel}")
print(f"\nTotal: {len(FILES)} files")
